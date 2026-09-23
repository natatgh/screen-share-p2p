export type MediaDirection = "send" | "receive";
export type MediaHealth = "connecting" | "good" | "degraded" | "poor";

export type PeerMetrics = {
  id: string;
  direction: MediaDirection;
  connection: RTCPeerConnectionState;
  health: MediaHealth;
  bitrateKbps: number | null;
  rttMs: number | null;
  jitterMs: number | null;
  fps: number | null;
  lossPercent: number | null;
  droppedFrames: number | null;
  freezes: number | null;
  recentDroppedFrames: number | null;
  recentFreezes: number | null;
  width: number | null;
  height: number | null;
};

export type StatsSnapshot = {
  timestamp: number;
  bytes: number;
  packetsLost: number;
  packetsReceived: number;
  frames: number;
  droppedFrames: number;
  freezes: number;
};

type Entry = RTCStats & Record<string, unknown>;

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function delta(current: number, previous: number | undefined): number | null {
  if (previous === undefined || current < previous) return null;
  return current - previous;
}

function rounded(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

export function readPeerMetrics(
  id: string,
  direction: MediaDirection,
  connection: RTCPeerConnectionState,
  report: RTCStatsReport,
  previous?: StatsSnapshot,
): { metrics: PeerMetrics; snapshot: StatsSnapshot } {
  const entries = [...report.values()] as Entry[];
  const type = direction === "send" ? "outbound-rtp" : "inbound-rtp";
  const media = entries.filter((entry) => entry.type === type && !entry.isRemote);
  const video = media.find((entry) => entry.kind === "video" || entry.mediaType === "video");
  const remoteInbound = entries.find((entry) => entry.type === "remote-inbound-rtp" && (entry.kind === "video" || entry.mediaType === "video"));
  const bytes = media.reduce((total, entry) => total + (number(direction === "send" ? entry.bytesSent : entry.bytesReceived) ?? 0), 0);
  const timestamp = Math.max(0, ...media.map((entry) => number(entry.timestamp) ?? 0));
  const lostValue = number(video?.packetsLost);
  const receivedValue = number(video?.packetsReceived);
  const frameValue = number(direction === "send" ? video?.framesEncoded : video?.framesDecoded);
  const droppedValue = number(video?.framesDropped);
  const freezeValue = number(video?.freezeCount);
  const packetsLost = lostValue ?? 0;
  const packetsReceived = receivedValue ?? 0;
  const frames = frameValue ?? 0;
  const droppedFrames = droppedValue ?? 0;
  const freezes = freezeValue ?? 0;
  const snapshot = { timestamp, bytes, packetsLost, packetsReceived, frames, droppedFrames, freezes };
  const seconds = previous && timestamp > previous.timestamp ? (timestamp - previous.timestamp) / 1000 : 0;
  const byteDelta = delta(bytes, previous?.bytes);
  const bitrateKbps = seconds > 0 && byteDelta !== null ? rounded(byteDelta * 8 / seconds / 1000) : null;
  const lostDelta = lostValue !== null ? delta(packetsLost, previous?.packetsLost) : null;
  const receivedDelta = receivedValue !== null ? delta(packetsReceived, previous?.packetsReceived) : null;
  const outboundFractionLost = number(remoteInbound?.fractionLost);
  const lossPercent = direction === "send" && outboundFractionLost !== null
    ? Math.round(Math.max(0, outboundFractionLost) * 1000) / 10
    : lostDelta !== null && receivedDelta !== null && lostDelta + receivedDelta > 0
      ? Math.round(lostDelta * 1000 / (lostDelta + receivedDelta)) / 10 : null;
  const frameDelta = frameValue !== null ? delta(frames, previous?.frames) : null;
  const fps = number(video?.framesPerSecond) ?? (seconds > 0 && frameDelta !== null ? rounded(frameDelta / seconds) : null);
  const droppedDelta = droppedValue !== null ? delta(droppedFrames, previous?.droppedFrames) : null;
  const freezeDelta = freezeValue !== null ? delta(freezes, previous?.freezes) : null;

  const transport = entries.find((entry) => entry.type === "transport");
  const pairId = transport?.selectedCandidatePairId;
  const pair = entries.find((entry) => entry.id === pairId) ?? entries.find((entry) =>
    entry.type === "candidate-pair" && (entry.selected === true || (entry.nominated === true && entry.state === "succeeded")));
  const rttSeconds = number(pair?.currentRoundTripTime) ?? number(remoteInbound?.roundTripTime);
  const rttMs = rttSeconds === null ? null : rounded(rttSeconds * 1000);
  const jitterSeconds = number(direction === "send" ? remoteInbound?.jitter : video?.jitter);
  const jitterMs = jitterSeconds === null ? null : rounded(jitterSeconds * 1000);

  let health: MediaHealth = connection === "connected" ? "good" : "connecting";
  if (connection === "failed" || connection === "disconnected" || connection === "closed") health = "poor";
  else if (connection === "connected") {
    if ((lossPercent ?? 0) >= 10 || (rttMs ?? 0) >= 700 || (jitterMs ?? 0) >= 100 || (freezeDelta ?? 0) >= 2) health = "poor";
    else if ((lossPercent ?? 0) >= 3 || (rttMs ?? 0) >= 250 || (jitterMs ?? 0) >= 40 || (freezeDelta ?? 0) > 0 || (droppedDelta ?? 0) >= 3) health = "degraded";
  }

  return {
    metrics: {
      id, direction, connection, health, bitrateKbps, rttMs, jitterMs, fps: rounded(fps), lossPercent,
      droppedFrames: droppedValue, freezes: freezeValue,
      recentDroppedFrames: droppedDelta, recentFreezes: freezeDelta,
      width: number(video?.frameWidth), height: number(video?.frameHeight),
    },
    snapshot,
  };
}
