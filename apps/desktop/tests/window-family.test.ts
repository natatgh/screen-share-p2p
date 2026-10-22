import test from "node:test";
import assert from "node:assert/strict";
import { parseProcessSnapshot, pickSuccessor, resolveFamily, windowPid } from "../electron/window-family";

// explorer(1) -> RiotClientServices(10, no window) -> LeagueClient(20, no window) -> Ux(30, window 300) and Game(40, window 400)
const output = [
  "W 300 30", "W 400 40", "W 900 1", "W 700 70",
  "P 1 0 explorer.exe", "P 10 1 RiotClientServices.exe", "P 20 10 LeagueClient.exe",
  "P 30 20 LeagueClientUx.exe", "P 40 20 League of Legends.exe", "P 70 1 notepad.exe",
].join("\r\n");
const snapshot = parseProcessSnapshot(output);

test("parses windows and the process table, including exe names with spaces", () => {
  assert.equal(windowPid(snapshot, "window:300:0"), 30);
  assert.equal(windowPid(snapshot, "window:300:1"), 30);
  assert.equal(windowPid(snapshot, "window:999:0"), undefined);
  assert.equal(windowPid(snapshot, "screen:0:0"), undefined);
  assert.equal(snapshot.exes.get(40), "league of legends.exe");
  assert.equal(snapshot.parents.get(40), 20);
});

test("the family is the windowless launcher's subtree, so the game follows the client", () => {
  const family = resolveFamily(snapshot, 30);
  assert.deepEqual(family, { rootPid: 20, includeRoot: false });
  const visible = ["window:700:0", "window:400:0", "window:900:0"];
  assert.equal(pickSuccessor(snapshot, family, visible, "window:300:0", 999), "window:400:0");
});

test("coming back from the game, the recreated client window is a valid successor", () => {
  const family = resolveFamily(snapshot, 30);
  const next = parseProcessSnapshot([...output.split("\r\n"), "W 310 30"].join("\n"));
  assert.equal(pickSuccessor(next, family, ["window:310:0", "window:700:0"], "window:400:0", 999), "window:310:0");
});

test("never leaves the app: unrelated windows, the shell and Lumen itself are skipped", () => {
  const family = resolveFamily(snapshot, 30);
  assert.equal(pickSuccessor(snapshot, family, ["window:700:0", "window:900:0"], "window:300:0", 999), null);
  assert.equal(pickSuccessor(snapshot, family, ["window:400:0"], "window:300:0", 40), null);
});

test("a launcher that owns a window, or a shell parent, limits the family to the shared process", () => {
  assert.deepEqual(resolveFamily(snapshot, 70), { rootPid: 70, includeRoot: true });
  const steam = parseProcessSnapshot("W 1 5\nW 2 6\nP 5 1 steam.exe\nP 6 5 game.exe\nP 7 5 other.exe\nW 3 7");
  assert.deepEqual(resolveFamily(steam, 6), { rootPid: 6, includeRoot: true });
  assert.equal(pickSuccessor(steam, { rootPid: 6, includeRoot: true }, ["window:3:0", "window:1:0"], "window:2:0", 999), null);
});

test("ignores malformed lines and stops at process cycles", () => {
  const broken = parseProcessSnapshot("garbage\nW x y\nP 2 3 a.exe\nP 3 2 b.exe\nW 5 2");
  assert.equal(pickSuccessor(broken, { rootPid: 99, includeRoot: true }, ["window:5:0"], "window:6:0", 1), null);
});
