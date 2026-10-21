export type RoomLock = { acquired: boolean; release: () => void };

const RETRY_DELAYS_MS = [0, 400, 800, 1200];
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// One tab per browser per room. A Web Lock is freed by the browser the instant its
// tab closes or reloads, unlike Presence entries, which linger until they time out
// and would make a refreshing tab see its own ghost as a duplicate. The retries
// cover the brief overlap while a reloading tab releases its lock. Fails open
// (acquired) wherever the Locks API is missing or denied.
export async function acquireRoomLock(room: string, locks: LockManager | undefined = globalThis.navigator?.locks, delays = RETRY_DELAYS_MS): Promise<RoomLock> {
  if (!locks) return { acquired: true, release() {} };
  for (const delay of delays) {
    if (delay) await sleep(delay);
    const release = await tryHold(locks, `lumen-room-${room}`);
    if (release) return { acquired: true, release };
  }
  return { acquired: false, release() {} };
}

function tryHold(locks: LockManager, name: string): Promise<(() => void) | null> {
  return new Promise((resolve) => {
    locks.request(name, { ifAvailable: true }, (lock) => {
      if (!lock) { resolve(null); return; }
      return new Promise<void>((release) => resolve(() => release()));
    }).catch(() => resolve(() => {}));
  });
}
