import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import WebSocket from "ws";

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

function waitMessage(socket: WebSocket, match: (message: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off("message", receive); reject(new Error("Signal timeout")); }, 5000);
    function receive(raw: WebSocket.RawData) {
      const message = JSON.parse(raw.toString());
      if (match(message)) { clearTimeout(timer); socket.off("message", receive); resolve(message); }
    }
    socket.on("message", receive);
  });
}

test("local signaling publishes presence and relays addressed offers", async () => {
  const port = await freePort();
  const server = spawn(process.execPath, ["--import", "tsx", "scripts/signaling.ts"], {
    cwd: process.cwd(), env: { ...process.env, SIGNAL_PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
  });
  const clients: WebSocket[] = [];
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Server timeout")), 5000);
      server.stdout.on("data", (data) => { if (data.toString().includes("Local signaling")) { clearTimeout(timer); resolve(); } });
      server.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    });
    const room = "ABCD2345";
    const a = "11111111-1111-4111-8111-111111111111";
    const b = "22222222-2222-4222-8222-222222222222";
    const connect = (id: string) => new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}/?room=${room}&id=${id}`);
      clients.push(socket);
      socket.once("open", () => resolve(socket)); socket.once("error", reject);
    });
    const first = await connect(a);
    const presence = waitMessage(first, (message) => message.type === "peers" && Array.isArray(message.ids) && message.ids.length === 2);
    const second = await connect(b);
    assert.deepEqual((await presence).ids, [a, b]);
    const offer = { from: a, to: b, owner: a, kind: "offer", data: { type: "offer", sdp: "test" } };
    const received = waitMessage(second, (message) => message.type === "signal");
    first.send(JSON.stringify({ type: "signal", signal: offer }));
    assert.deepEqual((await received).signal, offer);
  } finally {
    for (const client of clients) client.close();
    server.kill();
  }
});
