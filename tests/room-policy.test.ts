import test from "node:test";
import assert from "node:assert/strict";
import { isLockedOut } from "../src/lib/room-policy";

test("a locked room rejects everyone except the owner", () => {
  assert.equal(isLockedOut(true, false), true);
  assert.equal(isLockedOut(true, true), false);
  assert.equal(isLockedOut(false, false), false);
});
