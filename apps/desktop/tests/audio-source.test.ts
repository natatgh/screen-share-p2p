import test from "node:test";
import assert from "node:assert/strict";
import { audioSourceArgs } from "../electron/audio-source";

test("only monitors select the system mix, excluding Lumen's process tree", () => {
  assert.deepEqual(audioSourceArgs("screen:0:0", 123), ["--system", "123"]);
  assert.deepEqual(audioSourceArgs("window:456:1", 123), ["456"]);
  assert.deepEqual(audioSourceArgs("window:456:0", 123), ["456"]);
  for (const source of [undefined, "window:0:0", "window:abc:0", "screen:invalid", "--system"]) {
    assert.equal(audioSourceArgs(source, 123), null);
  }
  assert.equal(audioSourceArgs("screen:0:0", 0), null);
});
