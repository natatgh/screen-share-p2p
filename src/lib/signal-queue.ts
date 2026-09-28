/** Bounded FIFO: never broadcast before subscription, never replay stale SDP. */
export class SignalQueue<T> {
  private ready = false;
  private closed = false;
  private draining = false;
  private active: (() => void) | undefined;
  private items: { value: T; resolve: (ok: boolean) => void; expire: Promise<boolean>; cancel: () => void; timer: ReturnType<typeof setTimeout> }[] = [];
  constructor(private deliver: (value: T) => Promise<boolean>, private timeout = 10_000) {}
  setReady(ready: boolean) { this.ready = ready; void this.drain(); }
  send(value: T): Promise<boolean> {
    if (this.closed || this.items.length >= 128) return Promise.resolve(false);
    return new Promise((resolve) => {
      let cancel!: () => void;
      const expire = new Promise<boolean>((done) => { cancel = () => { done(false); resolve(false); }; });
      const item = { value, resolve, expire, cancel, timer: setTimeout(() => {
        const index = this.items.indexOf(item);
        if (index >= 0) this.items.splice(index, 1);
        cancel();
      }, this.timeout) };
      this.items.push(item);
      void this.drain();
    });
  }
  close() {
    this.closed = true; this.active?.();
    for (const item of this.items.splice(0)) { clearTimeout(item.timer); item.cancel(); }
  }
  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.ready && !this.closed && this.items.length) {
        const item = this.items.shift()!;
        this.active = item.cancel;
        let ok = false;
        try { ok = await Promise.race([this.deliver(item.value), item.expire]); } catch { /* Caller handles failure. */ }
        clearTimeout(item.timer); this.active = undefined;
        item.resolve(ok && !this.closed);
      }
    } finally { this.draining = false; }
  }
}
