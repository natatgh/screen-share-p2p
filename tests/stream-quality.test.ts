import { test } from "node:test";
import assert from "node:assert/strict";
import { applyScreenQuality, contentHintForQuality, encodingForQuality } from "../src/lib/stream-quality";

test("quality presets preserve native resolution or scale large captures", () => {
  assert.deepEqual(encodingForQuality("high", 2160), {
    maxBitrate: 6_000_000, maxFramerate: 30, scaleResolutionDownBy: 1,
  });
  assert.deepEqual(encodingForQuality("balanced", 2160), {
    maxBitrate: 3_000_000, maxFramerate: 30, scaleResolutionDownBy: 2,
  });
  assert.deepEqual(encodingForQuality("dataSaver", 2160), {
    maxBitrate: 1_000_000, maxFramerate: 15, scaleResolutionDownBy: 3,
  });
  assert.equal(encodingForQuality("dataSaver", 720).scaleResolutionDownBy, 1);
  assert.deepEqual(encodingForQuality("smooth", 1440), {
    maxBitrate: 2_500_000, maxFramerate: 30, scaleResolutionDownBy: 2,
  });
  assert.equal(contentHintForQuality("smooth"), "motion");
  assert.equal(contentHintForQuality("balanced"), "detail");
});

test("switching quality updates the active video sender", async () => {
  const parameters = { encodings: [{}] } as RTCRtpSendParameters;
  let applied: RTCRtpSendParameters | undefined;
  const sender = {
    track: { getSettings: () => ({ height: 2160 }) },
    getParameters: () => parameters,
    setParameters: async (next: RTCRtpSendParameters) => { applied = next; },
  } as unknown as RTCRtpSender;

  await applyScreenQuality(sender, "dataSaver");
  assert.equal(applied?.encodings[0].scaleResolutionDownBy, 3);
  assert.equal(applied?.encodings[0].maxBitrate, 1_000_000);
  assert.equal(applied?.encodings[0].maxFramerate, 15);
});
