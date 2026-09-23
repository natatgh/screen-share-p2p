import assert from "node:assert/strict";
import test from "node:test";
import { effectiveSettings, initialAdaptation, nextAdaptation } from "../src/lib/adaptive-quality";
import type { PeerMetrics } from "../src/lib/rtc-stats";
import type { StreamSettings } from "../src/lib/stream-quality";

const preferred: StreamSettings = { mode: "balanced", resolution: 1080, frameRate: 30 };
const stable = { direction: "send", connection: "connected", fps: 30, encodedFps: 30, captureFps: 30,
  lossPercent: 0, rttMs: 10, qualityLimitationReason: "none" } as PeerMetrics;

test("reduces one viewer after persistent encoder pressure and recovers slowly", () => {
  let state = { ...initialAdaptation };
  const slow = { ...stable, encodedFps: 16, fps: 16, qualityLimitationReason: "cpu" };
  state = nextAdaptation(state, slow, preferred, 12_000);
  state = nextAdaptation(state, slow, preferred, 14_000);
  assert.equal(state.step, 0);
  state = nextAdaptation(state, slow, preferred, 16_000);
  assert.equal(state.step, 1);
  assert.deepEqual(effectiveSettings(preferred, state.step), { ...preferred, resolution: 720 });
  for (let i = 0; i < 14; i++) state = nextAdaptation(state, stable, preferred, 18_000 + i * 2_000);
  assert.equal(state.step, 1);
  state = nextAdaptation(state, stable, preferred, 46_000);
  assert.equal(state.step, 0);
});

test("does not punish an encoder when the capture source itself runs slowly", () => {
  let state = { ...initialAdaptation };
  const slowSource = { ...stable, captureFps: 16, encodedFps: 16, fps: 16 };
  for (let i = 0; i < 5; i++) state = nextAdaptation(state, slowSource, preferred, 12_000 + i * 2_000);
  assert.equal(state.step, 0);
});

test("720p can reduce FPS without exceeding the manual ceiling", () => {
  assert.deepEqual(effectiveSettings({ ...preferred, resolution: 720 }, 1), { ...preferred, resolution: 720, frameRate: 15 });
  assert.deepEqual(effectiveSettings(preferred, 2), { ...preferred, resolution: 720, frameRate: 15 });
});
