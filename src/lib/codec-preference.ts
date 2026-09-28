export type VideoCodec = "auto" | "H264" | "VP9" | "VP8";
/** Keep RTX/RED/FEC and unsupported browser fallbacks; never rewrite SDP. */
export function codecOrder(codecs: RTCRtpCodec[], preferred: VideoCodec): RTCRtpCodec[] {
  if (preferred === "auto") return codecs;
  return [...codecs].sort((a, b) => Number(b.mimeType.toLowerCase() === `video/${preferred.toLowerCase()}`) - Number(a.mimeType.toLowerCase() === `video/${preferred.toLowerCase()}`));
}
export function preferVideoCodec(pc: RTCPeerConnection, codec: VideoCodec = "auto") {
  const transceiver = pc.getTransceivers().find((item) => item.sender.track?.kind === "video");
  if (!transceiver?.setCodecPreferences) return;
  const capabilities = RTCRtpReceiver.getCapabilities("video");
  if (capabilities) transceiver.setCodecPreferences(codecOrder(capabilities.codecs, codec));
}
