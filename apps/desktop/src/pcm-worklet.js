class LumenPcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = [];
    this.position = 0;
    this.phase = 0;
    this.carry = new Uint8Array(0);
    this.port.onmessage = (event) => {
      const received = new Uint8Array(event.data);
      const bytes = new Uint8Array(this.carry.length + received.length);
      bytes.set(this.carry);
      bytes.set(received, this.carry.length);
      const length = Math.floor(bytes.byteLength / 4) * 4;
      this.carry = bytes.slice(length);
      const incoming = new Int16Array(bytes.buffer, 0, length / 2);
      for (let i = 0; i < incoming.length; i++) this.samples.push(incoming[i] / 32768);
      if (this.samples.length - this.position > 44_100 * 2) {
        this.samples = this.samples.slice(-Math.round(44_100 * 2 * 0.15));
        this.position = 0;
        this.phase = 0;
      }
    };
  }
  process(_inputs, outputs) {
    const output = outputs[0];
    if (!output?.length) return true;
    const step = 44_100 / sampleRate;
    for (let i = 0; i < output[0].length; i++) {
      if (this.position + 3 < this.samples.length) {
        const left = this.samples[this.position] || 0;
        const right = this.samples[this.position + 1] || 0;
        const nextLeft = this.samples[this.position + 2] || 0;
        const nextRight = this.samples[this.position + 3] || 0;
        output[0][i] = left + (nextLeft - left) * this.phase;
        if (output[1]) output[1][i] = right + (nextRight - right) * this.phase;
        this.phase += step;
        while (this.phase >= 1) { this.phase -= 1; this.position += 2; }
      } else {
        output[0][i] = 0;
        if (output[1]) output[1][i] = 0;
      }
    }
    if (this.position > 8192) { this.samples = this.samples.slice(this.position); this.position = 0; }
    return true;
  }
}
registerProcessor("lumen-pcm", LumenPcmProcessor);
