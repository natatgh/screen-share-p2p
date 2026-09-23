import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoom, isValidRoom, normalizeRoom } from "../src/lib/room";

test("room codes use eight unambiguous characters", () => {
  for (let i = 0; i < 100; i++) assert.equal(isValidRoom(createRoom()), true);
});

test("room code input is normalized and validated", () => {
  assert.equal(normalizeRoom("ab-cd 2345"), "ABCD2345");
  assert.equal(isValidRoom("ABCD2345"), true);
  assert.equal(isValidRoom("ABCDO345"), false);
  assert.equal(isValidRoom("ABC"), false);
});
