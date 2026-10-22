import test from "node:test";
import assert from "node:assert/strict";
import { createSourceFollower } from "../electron/source-follower";
import { parseProcessSnapshot } from "../electron/window-family";

const snapshot = parseProcessSnapshot(["W 300 30", "W 400 40", "P 20 1 LeagueClient.exe", "P 30 20 ux.exe", "P 40 20 game.exe"].join("\n"));
const flush = () => new Promise((resolve) => setTimeout(resolve, 25));

function harness(initial: string[]) {
  const state = { visible: initial, retargets: [] as string[], errors: 0, snapshot: snapshot as typeof snapshot | null };
  const follower = createSourceFollower({
    ownPid: 1, intervalMs: 5, missesBeforeRetarget: 2,
    listWindowIds: async () => state.visible,
    snapshot: async () => state.snapshot,
    retarget: async (id) => { state.retargets.push(id); },
    onError: () => { state.errors += 1; },
  });
  return { state, follower };
}

test("moves to a sibling window of the same app once the shared window is gone", async () => {
  const { state, follower } = harness(["window:300:0"]);
  assert.equal(await follower.follow("window:300:0"), true);
  await flush();
  assert.deepEqual(state.retargets, []);
  state.visible = ["window:400:0"];
  await flush();
  follower.stop();
  assert.deepEqual(state.retargets, ["window:400:0"]);
});

test("does not move on a single missed poll or when no family window exists yet", async () => {
  const { state, follower } = harness(["window:300:0"]);
  await follower.follow("window:300:0");
  state.visible = [];
  await flush();
  assert.deepEqual(state.retargets, []);
  state.visible = ["window:300:0"];
  await flush();
  follower.stop();
  assert.deepEqual(state.retargets, []);
});

test("cannot follow a source it cannot attribute to a process, and stops polling after stop()", async () => {
  const { state, follower } = harness(["window:300:0"]);
  assert.equal(await follower.follow("window:999:0"), false);
  await follower.follow("window:300:0");
  follower.stop();
  state.visible = ["window:400:0"];
  await flush();
  assert.deepEqual(state.retargets, []);
});

test("keeps polling when the process snapshot is temporarily unavailable", async () => {
  const { state, follower } = harness(["window:300:0"]);
  await follower.follow("window:300:0");
  state.visible = ["window:400:0"];
  state.snapshot = null;
  await flush();
  state.snapshot = snapshot;
  await flush();
  follower.stop();
  assert.deepEqual(state.retargets, ["window:400:0"]);
});
