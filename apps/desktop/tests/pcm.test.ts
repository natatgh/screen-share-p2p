import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function processor() {
  let Processor: new () => { count: number; capacity: number; droppedFrames: number; port: { onmessage: (event: { data: unknown }) => void }; process: (inputs: unknown[], outputs: Float32Array[][]) => boolean };
  const context = { Float32Array, Uint8Array, sampleRate: 48000,
    AudioWorkletProcessor: class { port = { postMessage() {} }; },
    registerProcessor: (_name: string, cls: typeof Processor) => { Processor = cls; } };
  vm.runInNewContext(readFileSync(new URL("../src/pcm-worklet.js", import.meta.url), "utf8"), context);
  return new Processor!();
}

test("PCM ring handles split stereo frames, resampling, bursts and silence", () => {
  const worklet = processor();
  const pcm = new Int16Array(4410 * 2).fill(16384);
  const bytes = new Uint8Array(pcm.buffer);
  worklet.port.onmessage({ data: bytes.slice(0, 3).buffer });
  worklet.port.onmessage({ data: bytes.slice(3).buffer });
  const output = [new Float32Array(128), new Float32Array(128)];
  worklet.process([], [output]);
  assert.equal(output[0][0], 0.5); assert.equal(output[1][127], 0.5);
  for (let i = 0; i < 5; i++) worklet.port.onmessage({ data: pcm.buffer });
  assert.equal(worklet.count, worklet.capacity); assert.ok(worklet.droppedFrames > 0);
  for (let i = 0; i < 100; i++) worklet.process([], [output]);
  assert.equal(output[0][127], 0); assert.ok(worklet.count <= 1);
});
