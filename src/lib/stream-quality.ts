export type StreamQuality = "high" | "balanced" | "smooth" | "dataSaver";

const profiles = {
  high: { maxBitrate: 6_000_000, maxFramerate: 30, targetHeight: Infinity, degradationPreference: "maintain-resolution" },
  balanced: { maxBitrate: 3_000_000, maxFramerate: 30, targetHeight: 1080, degradationPreference: "balanced" },
  smooth: { maxBitrate: 2_500_000, maxFramerate: 30, targetHeight: 720, degradationPreference: "maintain-framerate" },
  dataSaver: { maxBitrate: 1_000_000, maxFramerate: 15, targetHeight: 720, degradationPreference: "balanced" },
} as const;

export function contentHintForQuality(quality: StreamQuality): "text" | "detail" | "motion" {
  if (quality === "smooth") return "motion";
  if (quality === "balanced") return "detail";
  return "text";
}

export function encodingForQuality(quality: StreamQuality, sourceHeight?: number) {
  const profile = profiles[quality];
  return {
    maxBitrate: profile.maxBitrate,
    maxFramerate: profile.maxFramerate,
    scaleResolutionDownBy: sourceHeight ? Math.max(1, sourceHeight / profile.targetHeight) : 1,
  };
}

export async function applyScreenQuality(sender: RTCRtpSender, quality: StreamQuality) {
  try {
    const parameters = sender.getParameters();
    if (!parameters.encodings?.length) parameters.encodings = [{}];
    Object.assign(parameters.encodings[0], encodingForQuality(quality, sender.track?.getSettings().height));
    parameters.degradationPreference = profiles[quality].degradationPreference;
    await sender.setParameters(parameters);
  } catch {
    // Unsupported settings must not interrupt the screen share.
  }
}
