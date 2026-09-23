import { createHash, verify } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { UPDATE_PUBLIC_KEY } from "./update-public-key";

const apiUrl = "https://api.github.com/repos/natatgh/screen-share-p2p/releases/latest";
export type UpdateManifest = { version: string; asset: string; sha256: string; size: number };
type ReleaseAsset = { name: string; browser_download_url: string };
type Release = { tag_name: string; assets: ReleaseAsset[] };
export type Distribution = "installed" | "standalone";
let checking = false;

export function newerVersion(candidate: string, current: string): boolean {
  const pattern = /^(\d+)\.(\d+)\.(\d+)$/;
  const next = candidate.match(pattern);
  const now = current.match(pattern);
  if (!next || !now) return false;
  for (let i = 1; i <= 3; i++) {
    if (Number(next[i]) > Number(now[i])) return true;
    if (Number(next[i]) < Number(now[i])) return false;
  }
  return false;
}

export function verifyManifest(raw: Buffer, signatureBase64: string, publicKey = UPDATE_PUBLIC_KEY): UpdateManifest | null {
  try {
    if (!verify(null, raw, publicKey, Buffer.from(signatureBase64.trim(), "base64"))) return null;
    const item = JSON.parse(raw.toString("utf8")) as UpdateManifest;
    if (!/^\d+\.\d+\.\d+$/.test(item.version)) return null;
    if (item.asset !== `Lumen-Desktop-${item.version}-Setup.exe`) return null;
    if (!/^[a-f0-9]{64}$/.test(item.sha256)) return null;
    if (!Number.isSafeInteger(item.size) || item.size < 1) return null;
    return item;
  } catch { return null; }
}

export async function verifyInstaller(file: string, manifest: UpdateManifest): Promise<boolean> {
  if ((await stat(file)).size !== manifest.size) return false;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex") === manifest.sha256;
}

async function fetchText(asset: ReleaseAsset): Promise<Buffer> {
  const response = await fetch(asset.browser_download_url, { headers: { "User-Agent": "Lumen-Desktop-Updater" } });
  if (!response.ok) throw new Error(`Falha HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > 16_384) throw new Error("Manifesto muito grande.");
  return data;
}

export async function checkForUpdate(userData: string, current: string, notify: (status: string) => void, distribution: Distribution = "installed"): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    notify("Procurando atualizações…");
    const response = await fetch(apiUrl, { headers: { "User-Agent": "Lumen-Desktop-Updater", Accept: "application/vnd.github+json" } });
    if (response.status === 404) { notify("Nenhuma versão publicada ainda."); return; }
    if (!response.ok) throw new Error(`Falha HTTP ${response.status}`);
    const release = await response.json() as Release;
    const version = release.tag_name.match(/^v(\d+\.\d+\.\d+)$/)?.[1];
    if (!version || !newerVersion(version, current)) { notify("Lumen Desktop está atualizado."); return; }
    const asset = (name: string) => release.assets.find((item) => item.name === name);
    const manifestAsset = asset("lumen-update.json");
    const signatureAsset = asset("lumen-update.sig");
    if (!manifestAsset || !signatureAsset) throw new Error("Release sem manifesto assinado.");
    const raw = await fetchText(manifestAsset);
    const signature = (await fetchText(signatureAsset)).toString("utf8");
    const manifest = verifyManifest(raw, signature);
    if (!manifest || manifest.version !== version) throw new Error("Assinatura da atualização inválida.");
    if (distribution === "standalone") {
      if (!asset(`Lumen-Desktop-${version}-Standalone.zip`)) throw new Error("ZIP standalone ausente da release.");
      notify(`Nova versão ${version} disponível. Abra Releases e baixe o ZIP standalone.`);
      return;
    }
    const installerAsset = asset(manifest.asset);
    if (!installerAsset) throw new Error("Instalador ausente da release.");
    const updateDir = path.join(userData, "updates");
    await mkdir(updateDir, { recursive: true });
    const target = path.join(updateDir, manifest.asset);
    if (!(await verifyInstaller(target, manifest).catch(() => false))) {
      notify(`Baixando Lumen Desktop ${version}…`);
      const download = await fetch(installerAsset.browser_download_url, { headers: { "User-Agent": "Lumen-Desktop-Updater" } });
      if (!download.ok || !download.body) throw new Error("Falha ao baixar atualização.");
      const temporary = `${target}.part`;
      await pipeline(Readable.fromWeb(download.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(temporary));
      if (!(await verifyInstaller(temporary, manifest))) throw new Error("Hash do instalador divergente.");
      await rename(temporary, target);
    }
    await writeFile(path.join(updateDir, "manifest.json"), raw);
    await writeFile(path.join(updateDir, "manifest.sig"), signature);
    notify(`Versão ${version} pronta. Será instalada na próxima abertura.`);
  } catch (error) {
    notify(`Atualização indisponível: ${error instanceof Error ? error.message : "erro desconhecido"}`);
  } finally { checking = false; }
}

export async function installPendingUpdate(userData: string, current: string, distribution: Distribution = "installed"): Promise<boolean> {
  if (distribution === "standalone") return false;
  const updateDir = path.join(userData, "updates");
  try {
    const raw = await readFile(path.join(updateDir, "manifest.json"));
    const signature = await readFile(path.join(updateDir, "manifest.sig"), "utf8");
    const manifest = verifyManifest(raw, signature);
    if (!manifest || !newerVersion(manifest.version, current)) return false;
    const installer = path.join(updateDir, manifest.asset);
    if (!(await verifyInstaller(installer, manifest))) return false;
    const child = spawn(installer, ["/S"], { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
    return true;
  } catch { return false; }
}
