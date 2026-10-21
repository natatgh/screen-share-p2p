export type PeerInfo = { id: string; joinedAt: number; browserId?: string };

// Another tab from the same browser is a duplicate only if it joined before us;
// the earlier tab stays, the later one yields. Equal timestamps never match (two
// distinct peers should not both treat each other as the duplicate).
export function isDuplicateTab(peers: PeerInfo[], selfBrowserId: string, selfJoinedAt: number): boolean {
  return peers.some((peer) => peer.browserId === selfBrowserId && peer.joinedAt < selfJoinedAt);
}

// A locked room only rejects a participant who is not the owner and has not
// synced presence before (new joiners); it never evicts someone already inside.
export function isLockedOut(locked: boolean, owner: boolean): boolean {
  return locked && !owner;
}
