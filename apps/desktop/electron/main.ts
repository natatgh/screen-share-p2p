import { app, BrowserWindow, desktopCapturer, ipcMain, Menu, session, shell, type DesktopCapturerSource } from "electron";
import { execFile, spawn, type ChildProcessByStdio } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { checkForUpdate, installPendingUpdate, type Distribution } from "./updater";
import { audioSourceArgs } from "./audio-source";
import { createSourceFollower } from "./source-follower";
import { parseProcessSnapshot, type ProcessSnapshot } from "./window-family";

let mainWindow: BrowserWindow | null = null;
let sources = new Map<string, DesktopCapturerSource>();
let selectedSource: DesktopCapturerSource | null = null;
let audioProcess: ChildProcessByStdio<null, Readable, Readable> | null = null;
let audioWanted = false;
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

function snapshotProcesses(): Promise<ProcessSnapshot | null> {
  return new Promise((resolve) => {
    execFile(audioHelperPath(), ["--tree"], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      resolve(error ? null : parseProcessSnapshot(stdout));
    });
  });
}

async function startAudio(): Promise<{ ok: boolean; error?: string }> {
  stopAudio();
  const args = audioSourceArgs(selectedSource?.id, process.pid);
  if (!args) return { ok: false, error: "Selecione uma janela ou monitor para compartilhar áudio." };
  return new Promise((resolve) => {
    const child = spawn(audioHelperPath(), args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
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

function notifyRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, ...args);
}

async function retargetCapture(next: DesktopCapturerSource): Promise<void> {
  selectedSource = next;
  notifyRenderer("capture:retarget", next.id);
  if (!audioWanted) return;
  const result = await startAudio();
  // An empty message clears the warning left by the previous window's audio ending.
  notifyRenderer("audio:error", result.ok ? "" : result.error ?? "Não foi possível acompanhar o áudio da nova janela.");
}

const follower = createSourceFollower({
  ownPid: process.pid,
  listWindowIds: async () => {
    const list = await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 }, fetchWindowIcons: false });
    for (const source of list) sources.set(source.id, source);
    return list.map((source) => source.id);
  },
  snapshot: snapshotProcesses,
  retarget: async (id) => {
    const next = sources.get(id);
    if (next) await retargetCapture(next);
  },
  onError: () => notifyRenderer("audio:error", "Não foi possível acompanhar a janela do aplicativo."),
});

async function createWindow(): Promise<void> {
  const icon = app.isPackaged
    ? path.join(process.resourcesPath, "assets", "lumen-icon.png")
    : path.join(__dirname, "..", "assets", "lumen-icon.png");
  mainWindow = new BrowserWindow({
    width: 1140, height: 760, minWidth: 860, minHeight: 600,
    backgroundColor: "#0F1013", title: "Lumen Desktop", icon,
    titleBarStyle: "hidden",
    // Matches the shared 68px room header; the last pixel stays free for its divider.
    titleBarOverlay: { color: "#0F1013", symbolColor: "#F4F1EA", height: 67 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, sandbox: true, nodeIntegration: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  if (app.isPackaged) await mainWindow.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  else await mainWindow.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  mainWindow.on("closed", () => { mainWindow = null; follower.stop(); stopAudio(); });
}

if (process.platform === "win32") app.setAppUserModelId("app.lumen.desktop");

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const distribution: Distribution = app.isPackaged && existsSync(path.join(path.dirname(app.getPath("exe")), "Uninstall Lumen Desktop.exe"))
    ? "installed" : "standalone";
  if (await installPendingUpdate(app.getPath("userData"), app.getVersion(), distribution)) { app.quit(); return; }
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
    follower.stop();
    audioWanted = false;
    stopAudio();
    return true;
  });
  ipcMain.handle("capture:follow", async (event) => {
    trusted(event);
    return selectedSource?.id.startsWith("window:") ? follower.follow(selectedSource.id) : false;
  });
  ipcMain.handle("capture:unfollow", (event) => { trusted(event); follower.stop(); });
  ipcMain.handle("audio:start", async (event) => { trusted(event); audioWanted = true; return startAudio(); });
  ipcMain.handle("audio:stop", (event) => { trusted(event); audioWanted = false; stopAudio(); });
  ipcMain.handle("app:metrics", (event) => {
    trusted(event);
    const metrics = app.getAppMetrics();
    return { cpuPercent: metrics.reduce((sum, item) => sum + item.cpu.percentCPUUsage, 0),
      memoryMb: metrics.reduce((sum, item) => sum + item.memory.workingSetSize, 0) / 1024 };
  });
  ipcMain.handle("app:version", (event) => { trusted(event); return app.getVersion(); });
  ipcMain.handle("app:releases", async (event) => { trusted(event); await shell.openExternal(releasesUrl); });
  ipcMain.handle("update:check", async (event) => {
    trusted(event);
    await checkForUpdate(app.getPath("userData"), app.getVersion(), (status) => mainWindow?.webContents.send("update:status", status), distribution);
  });
  await createWindow();
  if (app.isPackaged) {
    setTimeout(() => void checkForUpdate(app.getPath("userData"), app.getVersion(), (status) => mainWindow?.webContents.send("update:status", status), distribution), 5000);
    setInterval(() => void checkForUpdate(app.getPath("userData"), app.getVersion(), (status) => mainWindow?.webContents.send("update:status", status), distribution), 6 * 60 * 60 * 1000);
  }
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", stopAudio);
