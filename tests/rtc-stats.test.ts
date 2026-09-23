import assert from "node:assert/strict";
import test from "node:test";
import { readPeerMetrics } from "../src/lib/rtc-stats";

function report(timestamp: number, bytes: number, lost: number, received: number, dropped: number, freezes: number): RTCStatsReport {
  return new Map([
    ["transport", { id: "transport", type: "transport", timestamp, selectedCandidatePairId: "pair" }],
    ["pair", { id: "pair", type: "candidate-pair", timestamp, currentRoundTripTime: 0.32 }],
    ["video", { id: "video", type: "inbound-rtp", timestamp, kind: "video", bytesReceived: bytes,
      packetsLost: lost, packetsReceived: received, framesDecoded: received, framesDropped: dropped,
      freezeCount: freezes, jitter: 0.045, frameWidth: 1920, frameHeight: 1080 }],
  ]) as unknown as RTCStatsReport;
}

test("calculates interval bandwidth, loss and stream stalls from WebRTC counters", () => {
  const first = readPeerMetrics("peer", "receive", "connected", report(1000, 100_000, 2, 100, 0, 0));
  assert.equal(first.metrics.bitrateKbps, null);
  const second = readPeerMetrics("peer", "receive", "connected", report(3000, 140_000, 7, 195, 4, 1), first.snapshot);
  assert.equal(second.metrics.bitrateKbps, 160);
  assert.equal(second.metrics.rttMs, 320);
  assert.equal(second.metrics.jitterMs, 45);
  assert.equal(second.metrics.lossPercent, 5);
  assert.equal(second.metrics.fps, 48);
  assert.equal(second.metrics.droppedFrames, 4);
  assert.equal(second.metrics.freezes, 1);
  assert.equal(second.metrics.recentDroppedFrames, 4);
  assert.equal(second.metrics.recentFreezes, 1);
  assert.equal(second.metrics.health, "degraded");
});

test("counter resets never show negative traffic or packet loss", () => {
  const previous = readPeerMetrics("peer", "receive", "connected", report(1000, 100_000, 10, 200, 5, 1));
  const reset = readPeerMetrics("peer", "receive", "connected", report(3000, 100, 0, 3, 0, 0), previous.snapshot);
  assert.equal(reset.metrics.bitrateKbps, null);
  assert.equal(reset.metrics.lossPercent, null);
});

test("uses receiver feedback for sender packet loss when available", () => {
  const stats = new Map([
    ["video", { id: "video", type: "outbound-rtp", timestamp: 1000, kind: "video", bytesSent: 5000 }],
    ["feedback", { id: "feedback", type: "remote-inbound-rtp", timestamp: 1000, kind: "video", fractionLost: 0.12, roundTripTime: 0.5 }],
  ]) as unknown as RTCStatsReport;
  const sample = readPeerMetrics("peer", "send", "connected", stats);
  assert.equal(sample.metrics.lossPercent, 12);
  assert.equal(sample.metrics.rttMs, 500);
  assert.equal(sample.metrics.droppedFrames, null);
  assert.equal(sample.metrics.health, "poor");
});

test("separates capture, encoding and playback work when browser reports it", () => {
  const make = (timestamp: number, frames: number, seconds: number) => new Map([
    ["source", { id: "source", type: "media-source", timestamp, framesPerSecond: 30 }],
    ["codec", { id: "codec", type: "codec", timestamp, mimeType: "video/VP8" }],
    ["video", { id: "video", type: "outbound-rtp", timestamp, kind: "video", bytesSent: frames * 1000,
      framesEncoded: frames, framesSent: frames, framesPerSecond: 25, totalEncodeTime: seconds,
      mediaSourceId: "source", codecId: "codec", qualityLimitationReason: "cpu" }],
  ]) as unknown as RTCStatsReport;
  const first = readPeerMetrics("peer", "send", "connected", make(1000, 20, 0.2));
  const second = readPeerMetrics("peer", "send", "connected", make(3000, 70, 0.7), first.snapshot);
  assert.equal(second.metrics.captureFps, 30);
  assert.equal(second.metrics.encodedFps, 25);
  assert.equal(second.metrics.processingMs, 10);
  assert.equal(second.metrics.qualityLimitationReason, "cpu");
  assert.equal(second.metrics.codec, "VP8");
});
