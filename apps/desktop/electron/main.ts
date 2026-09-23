import { app, BrowserWindow, desktopCapturer, ipcMain, session, shell, type DesktopCapturerSource } from "electron";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import path from "node:path";
import type { Readable } from "node:stream";
import { checkForUpdate, installPendingUpdate } from "./updater";

let mainWindow: BrowserWindow | null = null;
let sources = new Map<string, DesktopCapturerSource>();
let selectedSource: DesktopCapturerSource | null = null;
let audioProcess: ChildProcessByStdio<null, Readable, Readable> | null = null;
const releasesUrl = "https://github.com/natatgh/screen-share-p2p/releases";

function trusted(event: Electron.IpcMainInvokeEvent): void {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error("Origem não autorizada.");
}

function stopAudio(): void {
  audioProcess?.kill();
  audioProcess = null;
}

function audioHelperPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "native", "lumen-audio.exe")
    : path.join(__dirname, "..", "native", "build", "Release", "lumen-audio.exe");
}

async function startAudio(): Promise<{ ok: boolean; error?: string }> {
  stopAudio();
  const match = selectedSource?.id.match(/^window:(\d+):[01]$/);
  if (!match) return { ok: false, error: "Áudio disponível somente para janelas." };
  return new Promise((resolve) => {
    const child = spawn(audioHelperPath(), [match[1]], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    audioProcess = child;
    let settled = false;
    let detail = "Não foi possível iniciar o áudio do aplicativo.";
    const finish = (result: { ok: boolean; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => { stopAudio(); finish({ ok: false, error: "Tempo esgotado ao iniciar o áudio." }); }, 8000);
    child.stderr.on("data", (chunk: Buffer) => {
      const message = chunk.toString("utf8").trim();
      if (message.includes("READY")) finish({ ok: true });
      else if (message) detail = message.slice(0, 220);
    });
    child.stdout.on("data", (chunk: Buffer) => {
      if (audioProcess === child && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("audio:chunk", chunk);
    });
    child.on("error", () => { if (audioProcess === child) audioProcess = null; finish({ ok: false, error: "Auxiliar de áudio indisponível. Compile o módulo nativo." }); });
    child.on("exit", () => {
      const active = audioProcess === child;
      if (active) audioProcess = null;
      if (!settled) finish({ ok: false, error: detail });
      else if (active && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("audio:error", "A captura de áudio terminou. O vídeo continua ativo.");
    });
  });
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1140, height: 760, minWidth: 860, minHeight: 600,
    backgroundColor: "#111719", title: "Lumen Desktop",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  if (app.isPackaged) await mainWindow.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  else await mainWindow.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  mainWindow.on("closed", () => { mainWindow = null; stopAudio(); });
}

app.whenReady().then(async () => {
  if (await installPendingUpdate(app.getPath("userData"), app.getVersion())) { app.quit(); return; }
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    if (selectedSource) callback({ video: selectedSource });
  });
  ipcMain.handle("sources:list", async (event) => {
    trusted(event);
    const list = await desktopCapturer.getSources({ types: ["window", "screen"], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: true });
    sources = new Map(list.map((source) => [source.id, source]));
    return list.map((source) => ({
      id: source.id, name: source.name, type: source.id.startsWith("window:") ? "window" : "screen",
      thumbnail: source.thumbnail.toDataURL(), icon: source.appIcon?.toDataURL() || null,
    }));
  });
  ipcMain.handle("sources:select", (event, id: string) => {
    trusted(event);
    if (typeof id !== "string" || !sources.has(id)) throw new Error("Fonte inválida.");
    selectedSource = sources.get(id)!;
    stopAudio();
    return true;
  });
  ipcMain.handle("audio:start", async (event) => { trusted(event); return startAudio(); });
  ipcMain.handle("audio:stop", (event) => { trusted(event); stopAudio(); });
  ipcMain.handle("app:version", (event) => { trusted(event); return app.getVersion(); });
  ipcMain.handle("app:releases", async (event) => { trusted(event); await shell.openExternal(releasesUrl); });
  ipcMain.handle("update:check", async (event) => {
    trusted(event);
    await checkForUpdate(app.getPath("userData"), app.getVersion(), (status) => mainWindow?.webContents.send("update:status", status));
  });
  await createWindow();
  if (app.isPackaged) {
    setTimeout(() => void checkForUpdate(app.getPath("userData"), app.getVersion(), (status) => mainWindow?.webContents.send("update:status", status)), 5000);
    setInterval(() => void checkForUpdate(app.getPath("userData"), app.getVersion(), (status) => mainWindow?.webContents.send("update:status", status)), 6 * 60 * 60 * 1000);
  }
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", stopAudio);
