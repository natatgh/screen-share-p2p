import { test } from "node:test";
import assert from "node:assert/strict";
import { applyScreenSettings, captureConstraintsForSettings, contentHintForSettings, defaultStreamSettings, displayCaptureOptions, encodingForSettings, removeNonTabAudio } from "../src/lib/stream-quality";

test("resolution and frame rate can be selected independently", () => {
  assert.deepEqual(defaultStreamSettings, { mode: "balanced", resolution: 1080, frameRate: 30 });
  assert.deepEqual(encodingForSettings({ mode: "smooth", resolution: 720, frameRate: 60 }, 1440), {
    maxBitrate: 4_000_000, maxFramerate: 60, scaleResolutionDownBy: 2,
  });
  assert.deepEqual(encodingForSettings({ mode: "detail", resolution: "source", frameRate: 15 }, 2160), {
    maxBitrate: 3_000_000, maxFramerate: 15, scaleResolutionDownBy: 1,
  });
  assert.equal(encodingForSettings({ mode: "balanced", resolution: 1080, frameRate: 30 }, 720).scaleResolutionDownBy, 1);
  assert.deepEqual(captureConstraintsForSettings({ mode: "balanced", resolution: "source", frameRate: 60 }), {
    frameRate: { ideal: 60, max: 60 },
  });
  assert.equal(contentHintForSettings({ mode: "smooth", resolution: 720, frameRate: 30 }), "motion");
  assert.equal(contentHintForSettings({ mode: "detail", resolution: 1080, frameRate: 30 }), "text");
});

test("changing settings updates the video sender", async () => {
  const parameters = { encodings: [{}] } as RTCRtpSendParameters;
  let applied: RTCRtpSendParameters | undefined;
  const sender = {
    track: { getSettings: () => ({ height: 2160 }) },
    getParameters: () => parameters,
    setParameters: async (next: RTCRtpSendParameters) => { applied = next; },
  } as unknown as RTCRtpSender;

  assert.equal(await applyScreenSettings(sender, { mode: "smooth", resolution: 720, frameRate: 60 }), true);
  assert.equal(applied?.encodings[0].scaleResolutionDownBy, 3);
  assert.equal(applied?.encodings[0].maxBitrate, 4_000_000);
  assert.equal(applied?.encodings[0].maxFramerate, 60);
  assert.equal(applied?.degradationPreference, "maintain-framerate");
});

test("capture offers tab audio but excludes window and system audio", () => {
  const options = displayCaptureOptions(defaultStreamSettings);
  assert.equal(options.audio, true);
  assert.equal(options.systemAudio, "exclude");
  assert.equal(options.windowAudio, "exclude");
  assert.equal((options.video as MediaTrackConstraints).displaySurface, "window");
});

test("non-tab capture never retains its audio track", () => {
  let stopped = false;
  let removed = false;
  const audio = { stop: () => { stopped = true; } } as MediaStreamTrack;
  const stream = {
    getVideoTracks: () => [{ getSettings: () => ({ displaySurface: "monitor" }) }],
    getAudioTracks: () => [audio],
    removeTrack: (track: MediaStreamTrack) => { removed = track === audio; },
  } as unknown as MediaStream;
  assert.equal(removeNonTabAudio(stream), true);
  assert.equal(stopped, true);
  assert.equal(removed, true);
});

test("tab capture keeps its own audio track", () => {
  let stopped = false;
  const stream = {
    getVideoTracks: () => [{ getSettings: () => ({ displaySurface: "browser" }) }],
    getAudioTracks: () => [{ stop: () => { stopped = true; } }],
  } as unknown as MediaStream;
  assert.equal(removeNonTabAudio(stream), false);
  assert.equal(stopped, false);
});
