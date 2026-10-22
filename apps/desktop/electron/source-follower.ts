import { pickSuccessor, resolveFamily, windowPid, type ProcessSnapshot, type WindowFamily } from "./window-family";

export type FollowDeps = {
  /** Ids of the windows desktopCapturer can capture right now, top-most first. */
  listWindowIds(): Promise<string[]>;
  snapshot(): Promise<ProcessSnapshot | null>;
  retarget(id: string): Promise<void>;
  onError(cause: unknown): void;
  ownPid: number;
  intervalMs?: number;
  missesBeforeRetarget?: number;
};

const DEFAULT_INTERVAL_MS = 1500;
const DEFAULT_MISSES = 2;

/**
 * Keeps a window share alive across the shared window's lifetime: when it disappears (the client hides
 * behind a game, a window is recreated), hands capture to another window of the same app.
 */
export function createSourceFollower(deps: FollowDeps) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let generation = 0;

  async function follow(sourceId: string): Promise<boolean> {
    stop();
    const current = ++generation;
    const initial = await deps.snapshot();
    const pid = initial ? windowPid(initial, sourceId) : undefined;
    if (!initial || pid === undefined || current !== generation) return false;
    const family: WindowFamily = resolveFamily(initial, pid);
    let currentId = sourceId;
    let misses = 0;
    let busy = false;
    const intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS;
    const missesBeforeRetarget = deps.missesBeforeRetarget ?? DEFAULT_MISSES;

    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const visible = await deps.listWindowIds();
        if (current !== generation) return;
        if (visible.includes(currentId)) { misses = 0; return; }
        // A single missed poll is often a transient state (fullscreen switch, animation).
        if (++misses < missesBeforeRetarget) return;
        const snapshot = await deps.snapshot();
        if (!snapshot || current !== generation) return;
        const next = pickSuccessor(snapshot, family, visible, currentId, deps.ownPid);
        if (!next) return;
        currentId = next;
        misses = 0;
        await deps.retarget(next);
      } catch (cause) {
        deps.onError(cause);
      } finally {
        busy = false;
      }
    };
    timer = setInterval(() => void tick(), intervalMs);
    return true;
  }

  function stop(): void {
    generation += 1;
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { follow, stop };
}
