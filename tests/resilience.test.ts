import test from "node:test";
import assert from "node:assert/strict";
import { SignalQueue } from "../src/lib/signal-queue";
import { PeerRecovery, candidateMatchesDescription } from "../src/lib/peer-recovery";
import { DiagnosticReport } from "../src/lib/diagnostic-report";
import { defaultStreamSettings } from "../src/lib/stream-quality";
import { sharedBitrateBudget, initialAdaptation, nextAdaptation } from "../src/lib/adaptive-quality";
import type { PeerMetrics } from "../src/lib/rtc-stats";
import { codecOrder } from "../src/lib/codec-preference";

test("an unresponsive transport cannot hang a send or prevent closing", async () => {
  const queue = new SignalQueue<string>(() => new Promise(() => {}), 10);
  queue.setReady(true);
  assert.equal(await queue.send("never acknowledged"), false);
  const pending = queue.send("closing"); queue.close();
  assert.equal(await pending, false);
});

test("codec comparison preserves redundancy codecs and falls back when unsupported", () => {
  const codecs = [{ mimeType: "video/VP8" }, { mimeType: "video/rtx" }, { mimeType: "video/H264" }] as RTCRtpCodec[];
  assert.deepEqual(codecOrder(codecs, "H264").map((item) => item.mimeType), ["video/H264", "video/VP8", "video/rtx"]);
  assert.deepEqual(codecOrder(codecs, "VP9"), codecs);
  assert.deepEqual(codecOrder(codecs, "auto"), codecs);
});

test("signaling waits for subscription, preserves offer/ICE order and fails stale sends", async () => {
  const delivered: string[] = [];
  const queue = new SignalQueue<string>(async (value) => { delivered.push(value); return true; }, 20);
  const offer = queue.send("offer"), ice = queue.send("ice");
  assert.deepEqual(delivered, []);
  queue.setReady(true);
  assert.deepEqual(await Promise.all([offer, ice]), [true, true]);
  assert.deepEqual(delivered, ["offer", "ice"]);
  queue.setReady(false);
  assert.equal(await queue.send("stale"), false);
  const pending = queue.send("pending"); queue.close();
  assert.equal(await pending, false);
  assert.equal(await queue.send("closed"), false);
});

test("delivery failure is surfaced and does not poison subsequent messages", async () => {
  const queue = new SignalQueue<string>(async (value) => { if (value === "bad") throw new Error("offline"); return true; });
  queue.setReady(true);
  assert.equal(await queue.send("bad"), false);
  assert.equal(await queue.send("good"), true);
  queue.close();
});

test("recovery restarts twice then rebuilds, and leaving cancels work", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let restarted = 0, rebuilt = 0;
  const recovery = new PeerRecovery(async () => { restarted++; }, () => { rebuilt++; }, 5, 10);
  recovery.state("disconnected");
  t.mock.timers.tick(5); await Promise.resolve(); await Promise.resolve();
  assert.equal(restarted, 1);
  t.mock.timers.tick(10); await Promise.resolve(); await Promise.resolve();
  assert.equal(restarted, 2);
  t.mock.timers.tick(10); assert.equal(rebuilt, 1);
  const stopped = new PeerRecovery(async () => { restarted++; }, () => { rebuilt++; }, 5, 10);
  stopped.state("failed"); stopped.close(); t.mock.timers.tick(100);
  assert.equal(restarted, 2);
});

test("successful recovery cancels the next timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let restarts = 0;
  const recovery = new PeerRecovery(async () => { restarts++; recovery.state("connected"); }, () => assert.fail("unexpected rebuild"), 5, 10);
  recovery.state("failed"); t.mock.timers.tick(0); await Promise.resolve(); await Promise.resolve();
  t.mock.timers.tick(100); assert.equal(restarts, 1); recovery.close();
});

test("ICE from old negotiations is rejected while legacy candidates still work", () => {
  const description = { sdp: "v=0\r\na=ice-ufrag:new\r\n" } as RTCSessionDescription;
  assert.equal(candidateMatchesDescription({ usernameFragment: "old" }, description), false);
  assert.equal(candidateMatchesDescription({ usernameFragment: "new" }, description), true);
  assert.equal(candidateMatchesDescription({}, description), true);
});

test("uplink estimates are shared conservatively and missing stats never cause recovery", () => {
  const make = (kbps: number | null) => ({ direction: "send", connection: "connected", availableOutgoingKbps: kbps }) as PeerMetrics;
  assert.equal(sharedBitrateBudget([make(6000), make(6000), make(6000)], 6), 1_600_000);
  assert.equal(sharedBitrateBudget([make(null)]), undefined);
  const state = { ...initialAdaptation, step: 1 as const, good: 14 };
  assert.equal(nextAdaptation(state, { encodedFps: null, fps: null, captureFps: null, qualityLimitationReason: null } as PeerMetrics, defaultStreamSettings, 100_000).step, 1);
});

test("diagnostic export is bounded and omits peer identifiers", () => {
  const report = new DiagnosticReport();
  for (let i = 0; i < 180; i++) report.add("Conectado", defaultStreamSettings, [{ id: "private-id", fps: 30 } as PeerMetrics]);
  const output = report.serialize();
  assert.equal(JSON.parse(output).samples.length, 150);
  assert.equal(output.includes("private-id"), false);
  report.reset(); assert.equal(JSON.parse(report.serialize()).samples.length, 0);
});
