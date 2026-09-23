import { createHash, createPrivateKey, sign } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const asset = `Lumen-Desktop-${version}-Setup.exe`;
const installer = await readFile(path.join(root, "release", asset));
const keyBase64 = process.env.LUMEN_UPDATE_PRIVATE_KEY_B64;
if (!keyBase64) throw new Error("LUMEN_UPDATE_PRIVATE_KEY_B64 ausente.");
const key = createPrivateKey(Buffer.from(keyBase64, "base64").toString("utf8"));
const raw = JSON.stringify({
  version, asset, sha256: createHash("sha256").update(installer).digest("hex"), size: installer.length,
}) + "\n";
const signature = sign(null, Buffer.from(raw), key).toString("base64") + "\n";
await writeFile(path.join(root, "release", "lumen-update.json"), raw);
await writeFile(path.join(root, "release", "lumen-update.sig"), signature);
process.stdout.write(`Manifesto assinado para ${asset}.\n`);
