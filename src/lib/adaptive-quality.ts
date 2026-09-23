import type { PeerMetrics } from "./rtc-stats";
import type { StreamSettings } from "./stream-quality";

export type AdaptationState = { step: 0 | 1 | 2; bad: number; good: number; lastChange: number };

export const initialAdaptation: AdaptationState = { step: 0, bad: 0, good: 0, lastChange: 0 };

export function effectiveSettings(preferred: StreamSettings, step: AdaptationState["step"]): StreamSettings {
  if (step === 0) return preferred;
  if (step === 2) return { ...preferred, resolution: 720, frameRate: 15 };
  if (preferred.resolution === 720 && preferred.frameRate <= 30) return { ...preferred, frameRate: 15 };
  return { ...preferred, resolution: 720, frameRate: Math.min(preferred.frameRate, 30) as 15 | 30 };
}

export function nextAdaptation(
  state: AdaptationState,
  metrics: PeerMetrics,
  preferred: StreamSettings,
  now: number,
): AdaptationState {
  const effective = effectiveSettings(preferred, state.step);
  const encoded = metrics.encodedFps ?? metrics.fps;
  const captureHealthy = metrics.captureFps !== null && metrics.captureFps >= effective.frameRate * 0.8;
  const limited = metrics.qualityLimitationReason === "cpu" || metrics.qualityLimitationReason === "bandwidth";
  const networkBad = (metrics.lossPercent ?? 0) >= 3 || (metrics.rttMs ?? 0) >= 250;
  const encodeBad = captureHealthy && encoded !== null && encoded < effective.frameRate * 0.75;
  const bad = limited || networkBad || encodeBad;
  const ready = now - state.lastChange >= 10_000;
  if (bad) {
    const count = state.bad + 1;
    if (ready && count >= 3 && state.step < 2) return { step: (state.step + 1) as 1 | 2, bad: 0, good: 0, lastChange: now };
    return { ...state, bad: count, good: 0 };
  }
  const count = state.good + 1;
  if (ready && count >= 15 && state.step > 0) return { step: (state.step - 1) as 0 | 1, bad: 0, good: 0, lastChange: now };
  return { ...state, bad: 0, good: count };
}
