import { test, expect, type Page } from "@playwright/test";

async function plays(page: Page) {
  await expect.poll(() => page.locator("video").evaluateAll((elements) => elements.some((element) => {
    const video = element as HTMLVideoElement;
    return video.readyState >= 2 && video.videoWidth > 0 && video.currentTime > 0;
  })), { timeout: 30_000 }).toBe(true);
}

test("one sender reaches three viewers, survives signaling reconnect, changes quality and stops", async ({ browser }) => {
  const errors: string[] = [];
  const pages: Page[] = [];
  try {
    for (let i = 0; i < 4; i++) {
      const page = await browser.newPage();
      pages.push(page);
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() => {
        const Socket = window.WebSocket;
        const sockets: WebSocket[] = [];
        Object.defineProperty(window, "__testSockets", { value: sockets });
        window.WebSocket = class extends Socket {
          constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); sockets.push(this); }
        };
        const Native = window.RTCPeerConnection;
        const links: RTCPeerConnection[] = [];
        Object.defineProperty(window, "__testPeers", { value: links });
        window.RTCPeerConnection = class extends Native {
          constructor(config?: RTCConfiguration) { super(config); links.push(this); }
        };
      });
      await page.goto("http://localhost:3330/room/ABCD2345");
      await expect(page.getByText("Conectado", { exact: true })).toBeVisible();
    }
    const sender = pages[0];
    await sender.evaluate(() => {
      Object.defineProperty(navigator.mediaDevices, "getDisplayMedia", { value: async () => {
        const canvas = document.createElement("canvas"); canvas.width = 1920; canvas.height = 1080;
        const context = canvas.getContext("2d")!;
        const draw = () => { context.fillStyle = `hsl(${performance.now() / 10 % 360}, 70%, 50%)`; context.fillRect(0, 0, canvas.width, canvas.height); requestAnimationFrame(draw); };
        draw();
        const stream = canvas.captureStream(30);
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings.bind(track);
        track.getSettings = () => ({ ...settings(), displaySurface: "monitor" });
        const audio = new AudioContext();
        const tone = audio.createOscillator();
        const destination = audio.createMediaStreamDestination();
        tone.connect(destination); tone.start();
        await audio.resume();
        stream.addTrack(destination.stream.getAudioTracks()[0]);
        track.addEventListener("ended", () => void audio.close(), { once: true });
        return stream;
      } });
    });
    await sender.getByRole("button", { name: "Compartilhar tela", exact: true }).click();
    for (const page of pages.slice(1)) {
      await plays(page);
      await expect.poll(() => page.evaluate(async () => {
        const links = (window as unknown as { __testPeers: RTCPeerConnection[] }).__testPeers;
        for (const pc of links) {
          const stats = await pc.getStats();
          for (const entry of stats.values()) {
            if (entry.type === "inbound-rtp" && entry.kind === "audio" && entry.bytesReceived > 0 && entry.totalAudioEnergy > 0) return true;
          }
        }
        return false;
      }), { timeout: 15_000 }).toBe(true);
    }
    // Fault injection exercises a real ICE restart and new offer/answer exchange.
    const original = await sender.evaluate(() => {
      const pc = (window as unknown as { __testPeers: RTCPeerConnection[] }).__testPeers.find((item) => item.connectionState === "connected")!;
      Object.defineProperty(window, "__testRestartPeer", { value: pc });
      const sdp = pc.localDescription!.sdp;
      Object.defineProperty(pc, "connectionState", { configurable: true, value: "failed" });
      pc.dispatchEvent(new Event("connectionstatechange"));
      Reflect.deleteProperty(pc, "connectionState");
      return sdp.match(/a=ice-ufrag:(.*)/)?.[1];
    });
    await expect.poll(() => sender.evaluate((prior) => {
      const pc = (window as unknown as { __testRestartPeer: RTCPeerConnection }).__testRestartPeer;
      const ufrag = pc.localDescription?.sdp.match(/a=ice-ufrag:(.*)/)?.[1];
      return pc.connectionState === "connected" && !!ufrag && ufrag !== prior;
    }, original), { timeout: 30_000 }).toBe(true);
    for (const page of pages.slice(1)) await plays(page);
    await sender.getByRole("button", { name: /QUALIDADE/ }).click();
    await sender.getByRole("button", { name: "720p", exact: true }).click();
    await expect(sender.getByRole("button", { name: /QUALIDADE/ })).toContainText("720p");
    for (const page of pages.slice(1)) await plays(page);
    const viewer = pages[1];
    await viewer.context().setOffline(true);
    await viewer.evaluate(() => {
      for (const socket of (window as unknown as { __testSockets: WebSocket[] }).__testSockets) socket.close();
    });
    await expect(viewer.getByText("Conectado", { exact: true })).not.toBeVisible();
    await viewer.context().setOffline(false);
    await expect(viewer.getByText("Conectado", { exact: true })).toBeVisible();
    await plays(viewer);
    await sender.getByRole("tab", { name: "Conexão", exact: true }).click();
    await sender.getByLabel("Codec para comparação").selectOption("H264");
    await expect.poll(() => sender.getByText("H264", { exact: true }).count(), { timeout: 15_000 }).toBeGreaterThan(0);
    for (const page of pages.slice(1)) await plays(page);
    await expect(sender.locator("select").filter({ has: sender.locator('option[value="H264"]') })).toHaveValue("H264");
    const download = sender.waitForEvent("download");
    await sender.getByRole("button", { name: /Exportar diagnóstico/ }).click();
    expect((await download).suggestedFilename()).toBe("lumen-diagnostics.json");
    await sender.getByRole("button", { name: "Parar transmissão", exact: true }).click();
    for (const page of pages.slice(1)) await expect(page.locator("video")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await Promise.all(pages.map((page) => page.context().close())); }
});
