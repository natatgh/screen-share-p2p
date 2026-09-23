import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tag = process.argv[2];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (tag !== `v${version}`) throw new Error(`Tag ${tag} não corresponde ao desktop ${version}.`);
process.stdout.write(`Versão ${version} validada.\n`);
