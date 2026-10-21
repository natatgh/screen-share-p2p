// A locked room only rejects a participant who is not the owner and has not
// synced presence before (new joiners); it never evicts someone already inside.
export function isLockedOut(locked: boolean, owner: boolean): boolean {
  return locked && !owner;
}
