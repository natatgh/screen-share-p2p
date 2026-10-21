import test from "node:test";
import assert from "node:assert/strict";
import { isDuplicateTab, isLockedOut, type PeerInfo } from "../src/lib/room-policy";

test("a later tab from the same browser is flagged as a duplicate", () => {
  const peers: PeerInfo[] = [{ id: "a", joinedAt: 100, browserId: "same" }];
  assert.equal(isDuplicateTab(peers, "same", 200), true);
});

test("the earlier tab never treats a later one as the duplicate", () => {
  const peers: PeerInfo[] = [{ id: "a", joinedAt: 200, browserId: "same" }];
  assert.equal(isDuplicateTab(peers, "same", 100), false);
});

test("different browsers never collide even with the same join time", () => {
  const peers: PeerInfo[] = [{ id: "a", joinedAt: 100, browserId: "other" }];
  assert.equal(isDuplicateTab(peers, "same", 150), false);
});

test("a locked room rejects everyone except the owner", () => {
  assert.equal(isLockedOut(true, false), true);
  assert.equal(isLockedOut(true, true), false);
  assert.equal(isLockedOut(false, false), false);
});
