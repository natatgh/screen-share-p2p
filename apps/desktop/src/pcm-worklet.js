// Fixed 200 ms stereo ring. No growing arrays or slicing on the audio thread.
class LumenPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = 8820;
    this.samples = new Float32Array(this.capacity * 2);
    this.read = 0; this.write = 0; this.count = 0; this.phase = 0;
    this.carry = new Uint8Array(4); this.carryLength = 0;
    this.droppedFrames = 0; this.underruns = 0;
    this.port.onmessage = ({ data }) => {
      if (data?.type === "stats") {
        this.port.postMessage({ audioBufferedMs: this.count * 1000 / 44100, audioDroppedFrames: this.droppedFrames, audioUnderruns: this.underruns });
        return;
      }
      const bytes = new Uint8Array(data);
      for (let offset = 0; offset < bytes.length; offset++) {
        this.carry[this.carryLength++] = bytes[offset];
        if (this.carryLength !== 4) continue;
        this.carryLength = 0;
        if (this.count === this.capacity) {
          this.read = (this.read + 1) % this.capacity; this.count--; this.droppedFrames++; this.phase = 0;
        }
        const left = (this.carry[0] | this.carry[1] << 8) << 16 >> 16;
        const right = (this.carry[2] | this.carry[3] << 8) << 16 >> 16;
        this.samples[this.write * 2] = left / 32768;
        this.samples[this.write * 2 + 1] = right / 32768;
        this.write = (this.write + 1) % this.capacity; this.count++;
      }
    };
  }
  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output?.length) return true;
    const step = 44100 / sampleRate;
    let starved = false;
    for (let i = 0; i < output[0].length; i++) {
      if (this.count >= 2) {
        const next = (this.read + 1) % this.capacity;
        for (let channel = 0; channel < Math.min(output.length, 2); channel++) {
          const value = this.samples[this.read * 2 + channel];
          output[channel][i] = value + (this.samples[next * 2 + channel] - value) * this.phase;
        }
        this.phase += step;
        while (this.phase >= 1 && this.count) { this.phase--; this.read = (this.read + 1) % this.capacity; this.count--; }
      } else {
        for (const channel of output) channel[i] = 0;
        this.phase = 0; starved = true;
      }
    }
    if (starved) this.underruns++;
    return true;
  }
}
registerProcessor("lumen-pcm", LumenPcmProcessor);
