import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { newerVersion, verifyInstaller, verifyManifest } from "../electron/updater";

test("updater accepts only newer stable semantic versions", () => {
  assert.equal(newerVersion("0.1.1", "0.1.0"), true);
  assert.equal(newerVersion("0.2.0", "0.9.0"), false);
  assert.equal(newerVersion("0.1.0", "0.1.0"), false);
  assert.equal(newerVersion("0.2.0-beta", "0.1.0"), false);
});

test("signed manifest and installer hash reject tampering", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const directory = await mkdtemp(path.join(os.tmpdir(), "lumen-update-test-"));
  try {
    const file = path.join(directory, "Lumen-Desktop-0.1.1-Setup.exe");
    const binary = Buffer.from("test installer");
    await writeFile(file, binary);
    const raw = Buffer.from(JSON.stringify({
      version: "0.1.1", asset: path.basename(file), size: binary.length,
      sha256: createHash("sha256").update(binary).digest("hex"),
    }) + "\n");
    const signature = sign(null, raw, privateKey).toString("base64");
    const key = publicKey.export({ type: "spki", format: "pem" });
    const manifest = verifyManifest(raw, signature, key);
    assert.ok(manifest);
    assert.equal(await verifyInstaller(file, manifest), true);
    assert.equal(verifyManifest(Buffer.from(raw.toString().replace("0.1.1", "0.1.2")), signature, key), null);
    await writeFile(file, "tampered installer");
    assert.equal(await verifyInstaller(file, manifest), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
