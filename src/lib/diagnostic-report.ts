import type { PeerMetrics } from "./rtc-stats";
import type { StreamSettings } from "./stream-quality";

export type RuntimeMetrics = { cpuPercent: number; memoryMb: number; audioBufferedMs?: number; audioDroppedFrames?: number; audioUnderruns?: number };
type Sample = { elapsedMs: number; status: string; settings: StreamSettings; peers: Omit<PeerMetrics, "id">[]; runtime?: RuntimeMetrics };

/** Five minutes, explicit download only. No room codes, peer IDs, SDP or ICE. */
export class DiagnosticReport {
  private samples: Sample[] = [];
  private started = Date.now();
  add(status: string, settings: StreamSettings, metrics: PeerMetrics[], runtime?: RuntimeMetrics) {
    this.samples.push({ elapsedMs: Date.now() - this.started, status, settings: { ...settings },
      peers: metrics.map(({ id: _id, ...sample }) => { void _id; return sample; }), runtime });
    if (this.samples.length > 150) this.samples.shift();
  }
  reset() { this.samples = []; this.started = Date.now(); }
  serialize() { return JSON.stringify({ schemaVersion: 1, sampleIntervalMs: 2000, samples: this.samples }, null, 2); }
}

const playback = new Map<string, number>();
export function playbackFps(track: MediaStreamTrack | undefined) { return track ? playback.get(track.id) ?? null : null; }
export function observePlayback(video: HTMLVideoElement, stream: MediaStream): () => void {
  const track = stream.getVideoTracks()[0];
  if (!track || !video.requestVideoFrameCallback) return () => {};
  let last = 0, frames = 0, handle = 0, active = true;
  const tick = (now: number, metadata: VideoFrameCallbackMetadata) => {
    if (!active) return;
    if (!last) { last = now; frames = metadata.presentedFrames; }
    else if (now - last >= 1000) {
      playback.set(track.id, Math.round((metadata.presentedFrames - frames) * 1000 / (now - last)));
      last = now; frames = metadata.presentedFrames;
    }
    handle = video.requestVideoFrameCallback(tick);
  };
  handle = video.requestVideoFrameCallback(tick);
  const stalled = setInterval(() => { if (last && performance.now() - last > 3000) playback.set(track.id, 0); }, 2000);
  return () => { active = false; video.cancelVideoFrameCallback(handle); clearInterval(stalled); playback.delete(track.id); };
}
