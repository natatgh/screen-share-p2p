import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = process.argv[2];
if (!/^[a-f0-9]{40}$/.test(base || "")) throw new Error("Informe o SHA base do pull request.");

const changed = execFileSync("git", ["diff", "--name-only", base, "HEAD", "--", "apps/desktop"], { encoding: "utf8" })
  .trim().split("\n").filter((file) => file && file !== "apps/desktop/README.md");
if (!changed.length) process.exit(0);

const previous = JSON.parse(execFileSync("git", ["show", `${base}:apps/desktop/package.json`], { encoding: "utf8" })).version;
const current = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const parse = (value) => {
  if (!/^\d+\.\d+\.\d+$/.test(value)) throw new Error(`Versão SemVer inválida: ${value}`);
  return value.split(".").map(Number);
};
const before = parse(previous);
const after = parse(current);
const increased = after.some((part, index) => part > before[index] && after.slice(0, index).every((earlier, i) => earlier === before[i]));

if (!increased) throw new Error(`O Desktop mudou, mas a versão não avançou: ${previous} → ${current}. Atualize apps/desktop/package.json e package-lock.json.`);
if (lock.version !== current || lock.packages[""].version !== current) throw new Error("A versão do package-lock.json não corresponde ao package.json.");
console.log(`Versão do Desktop: ${previous} → ${current}`);
