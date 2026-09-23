import { test } from "node:test";
import assert from "node:assert/strict";
import { applyScreenSettings, captureConstraintsForSettings, contentHintForSettings, defaultStreamSettings, encodingForSettings } from "../src/lib/stream-quality";

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
