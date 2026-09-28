/** Sender owns renegotiation. The answerer keeps the existing connection. */
export class PeerRecovery {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private attempts = 0;
  private closed = false;
  private connected = false;
  constructor(private restart: () => Promise<void>, private rebuild: () => void,
    private grace = 5_000, private attemptTimeout = 12_000) {}
  state(state: RTCPeerConnectionState) {
    if (this.closed) return;
    this.connected = state === "connected";
    if (state === "connected") { clearTimeout(this.timer); this.timer = undefined; this.attempts = 0; }
    else if ((state === "failed" || state === "disconnected") && !this.timer) this.schedule(state === "failed" ? 0 : this.grace);
  }
  negotiating() { if (!this.closed && !this.connected && !this.timer) this.schedule(this.attemptTimeout); }
  close() { this.closed = true; clearTimeout(this.timer); }
  private schedule(delay: number) {
    this.timer = setTimeout(async () => {
      this.timer = undefined;
      if (this.closed) return;
      if (this.attempts >= 2) { this.close(); this.rebuild(); return; }
      this.attempts++;
      try { await this.restart(); } catch { /* Retry on timeout while peer remains. */ }
      if (!this.closed && !this.connected && !this.timer) this.schedule(this.attemptTimeout);
    }, delay);
  }
}

export function candidateMatchesDescription(candidate: RTCIceCandidateInit, description: RTCSessionDescription | null): boolean {
  if (!candidate.usernameFragment || !description?.sdp) return true; // Legacy clients.
  return description.sdp.split(/\r?\n/).some((line) => line === `a=ice-ufrag:${candidate.usernameFragment}`);
}
