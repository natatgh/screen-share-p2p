/** Visible windows and the process table, as printed by `lumen-audio.exe --tree`. */
export type ProcessSnapshot = {
  windowPids: ReadonlyMap<string, number>;
  parents: ReadonlyMap<number, number>;
  exes: ReadonlyMap<number, string>;
};

/** The processes whose windows count as "the same app" as the one being shared. */
export type WindowFamily = { rootPid: number; includeRoot: boolean };

/** Launchers that spawn unrelated apps; their other children are not part of the shared app. */
const SYSTEM_PARENTS = new Set(["explorer.exe", "services.exe", "svchost.exe", "wininit.exe", "winlogon.exe", "userinit.exe", "runtimebroker.exe"]);
const MAX_ANCESTOR_DEPTH = 32;

export function parseProcessSnapshot(output: string): ProcessSnapshot {
  const windowPids = new Map<string, number>();
  const parents = new Map<number, number>();
  const exes = new Map<number, string>();
  for (const line of output.split(/\r?\n/)) {
    const window = line.match(/^W (\d+) (\d+)$/);
    if (window) { windowPids.set(`window:${window[1]}:0`, Number(window[2])); continue; }
    const process = line.match(/^P (\d+) (\d+) (.+)$/);
    if (process) {
      parents.set(Number(process[1]), Number(process[2]));
      exes.set(Number(process[1]), process[3].toLowerCase());
    }
  }
  return { windowPids, parents, exes };
}

/** `window:<hwnd>:<n>` ids from desktopCapturer match on the handle alone. */
export function windowPid(snapshot: ProcessSnapshot, sourceId: string): number | undefined {
  const handle = sourceId.match(/^window:(\d+):\d+$/)?.[1];
  return handle ? snapshot.windowPids.get(`window:${handle}:0`) : undefined;
}

function hasWindow(snapshot: ProcessSnapshot, pid: number): boolean {
  for (const owner of snapshot.windowPids.values()) if (owner === pid) return true;
  return false;
}

/**
 * Games are often spawned by a windowless launcher process next to the client (LeagueClient.exe starts
 * both the client UI and the match), so the family is the launcher's subtree when the launcher has no
 * window of its own; otherwise it is just the shared window's own process and its children.
 */
export function resolveFamily(snapshot: ProcessSnapshot, pid: number): WindowFamily {
  const parent = snapshot.parents.get(pid);
  const parentExe = parent === undefined ? undefined : snapshot.exes.get(parent);
  const sharesLauncher = parent !== undefined && parentExe !== undefined && !SYSTEM_PARENTS.has(parentExe) && !hasWindow(snapshot, parent);
  return sharesLauncher ? { rootPid: parent, includeRoot: false } : { rootPid: pid, includeRoot: true };
}

function inFamily(snapshot: ProcessSnapshot, family: WindowFamily, pid: number): boolean {
  let current: number | undefined = pid;
  for (let depth = 0; current !== undefined && depth < MAX_ANCESTOR_DEPTH; depth += 1) {
    if (current === family.rootPid) return current !== pid || family.includeRoot;
    current = snapshot.parents.get(current);
  }
  return false;
}

/** The first family window in z-order (desktopCapturer lists top-most first), or null while none is visible. */
export function pickSuccessor(snapshot: ProcessSnapshot, family: WindowFamily, visibleIds: readonly string[], currentId: string, ownPid: number): string | null {
  for (const id of visibleIds) {
    if (id === currentId) continue;
    const pid = windowPid(snapshot, id);
    if (pid !== undefined && pid !== ownPid && inFamily(snapshot, family, pid)) return id;
  }
  return null;
}
