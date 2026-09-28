import type { VideoCodec } from "./codec-preference";
export type StreamMode = "balanced" | "smooth" | "detail";
export type StreamResolution = 720 | 1080 | "source";
export type StreamFrameRate = 15 | 30 | 60;
export type StreamSettings = {
  mode: StreamMode;
  resolution: StreamResolution;
  frameRate: StreamFrameRate;
  /** Optional measured upload ceiling shared by all viewers, in Mbps. */
  uploadBudgetMbps?: number;
  codec?: VideoCodec;
};

export const defaultStreamSettings: StreamSettings = {
  mode: "balanced",
  resolution: 1080,
  frameRate: 30,
};

const bitrateLimits: Record<StreamResolution, Record<StreamFrameRate, number>> = {
  720: { 15: 1_200_000, 30: 2_500_000, 60: 4_000_000 },
  1080: { 15: 2_000_000, 30: 4_000_000, 60: 6_000_000 },
  source: { 15: 3_000_000, 30: 6_000_000, 60: 8_000_000 },
};

export function contentHintForSettings(settings: StreamSettings): "text" | "detail" | "motion" {
  if (settings.mode === "smooth") return "motion";
  if (settings.mode === "detail") return "text";
  return "detail";
}

export function captureConstraintsForSettings(settings: StreamSettings): MediaTrackConstraints {
  return {
    frameRate: { ideal: settings.frameRate, max: settings.frameRate },
    ...(settings.resolution === "source" ? {} : { height: { ideal: settings.resolution, max: settings.resolution } }),
  };
}

type ScopedDisplayMediaOptions = DisplayMediaStreamOptions & { systemAudio: "include"; windowAudio: "exclude" };

export function displayCaptureOptions(settings: StreamSettings): ScopedDisplayMediaOptions {
  return {
    video: { ...captureConstraintsForSettings(settings), displaySurface: "window" },
    audio: true,
    systemAudio: "include",
    windowAudio: "exclude",
  };
}

export function removeUnscopedWindowAudio(stream: MediaStream): boolean {
  const surface = stream.getVideoTracks()[0]?.getSettings().displaySurface;
  if (surface === "browser" || surface === "monitor") return false;
  for (const track of stream.getAudioTracks()) {
    track.stop();
    stream.removeTrack(track);
  }
  return true;
}

export function encodingForSettings(settings: StreamSettings, sourceHeight?: number): RTCRtpEncodingParameters {
  const targetHeight = settings.resolution === "source" ? Infinity : settings.resolution;
  return {
    maxBitrate: bitrateLimits[settings.resolution][settings.frameRate],
    maxFramerate: settings.frameRate,
    scaleResolutionDownBy: sourceHeight ? Math.max(1, sourceHeight / targetHeight) : 1,
  };
}

// Polling and manual changes share a sender. Read transactionId only when the
// previous update completes, so overlapping setParameters cannot invalidate it.
const senderUpdates = new WeakMap<RTCRtpSender, Promise<boolean>>();

export function applyScreenSettings(sender: RTCRtpSender, settings: StreamSettings, bitrateBudget?: number): Promise<boolean> {
  const next = (senderUpdates.get(sender) ?? Promise.resolve(true))
    .then(() => updateScreenSettings(sender, settings, bitrateBudget));
  senderUpdates.set(sender, next);
  return next;
}

async function updateScreenSettings(sender: RTCRtpSender, settings: StreamSettings, bitrateBudget?: number): Promise<boolean> {
  try {
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) parameters.encodings = [{}];
    Object.assign(parameters.encodings[0], encodingForSettings(settings, sender.track?.getSettings().height));
    if (bitrateBudget !== undefined) parameters.encodings[0].maxBitrate = Math.min(parameters.encodings[0].maxBitrate!, Math.max(100_000, bitrateBudget));
    parameters.degradationPreference = settings.mode === "smooth" ? "maintain-framerate" : settings.mode === "detail" ? "maintain-resolution" : "balanced";
    await sender.setParameters(parameters);
    return true;
  } catch {
    return false;
  }
}
