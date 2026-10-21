import test from "node:test";
import assert from "node:assert/strict";
import { acquireRoomLock } from "../src/lib/room-lock";

// Minimal LockManager: exclusive locks, granted only if free (ifAvailable).
function fakeLocks(): LockManager {
  const held = new Set<string>();
  return {
    request: async (name: string, _options: unknown, callback: (lock: unknown) => unknown) => {
      if (held.has(name)) return callback(null);
      held.add(name);
      try { return await callback({ name }); } finally { held.delete(name); }
    },
  } as unknown as LockManager;
}

test("a second tab in the same room is refused while the first holds the lock", async () => {
  const locks = fakeLocks();
  const first = await acquireRoomLock("ROOM2345", locks, [0]);
  assert.equal(first.acquired, true);
  assert.equal((await acquireRoomLock("ROOM2345", locks, [0])).acquired, false);
  first.release();
});

test("different rooms never block each other", async () => {
  const locks = fakeLocks();
  const first = await acquireRoomLock("ROOM2345", locks, [0]);
  assert.equal((await acquireRoomLock("OTHR2345", locks, [0])).acquired, true);
  first.release();
});

test("a reloading tab gets the lock once the old page releases it", async () => {
  const locks = fakeLocks();
  const old = await acquireRoomLock("ROOM2345", locks, [0]);
  setTimeout(() => old.release(), 10);
  assert.equal((await acquireRoomLock("ROOM2345", locks, [0, 40])).acquired, true);
});

test("fails open when the Locks API is unavailable or denied", async () => {
  assert.equal((await acquireRoomLock("ROOM2345", undefined, [0])).acquired, true);
  const denied = { request: async () => { throw new DOMException("denied", "SecurityError"); } } as unknown as LockManager;
  assert.equal((await acquireRoomLock("ROOM2345", denied, [0])).acquired, true);
});
