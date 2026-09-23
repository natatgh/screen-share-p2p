import { WebSocketServer, type WebSocket } from "ws";

const port = Number(process.env.SIGNAL_PORT || 3001);
const server = new WebSocketServer({ port, host: "127.0.0.1" });
const rooms = new Map<string, Map<string, WebSocket>>();

server.on("connection", (socket, request) => {
  const url = new URL(request.url || "/", "http://localhost");
  const room = url.searchParams.get("room") || "";
  const id = url.searchParams.get("id") || "";
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(room) || !/^[a-f0-9-]{36}$/.test(id)) return socket.close(1008, "Invalid room or ID");
  const peers = rooms.get(room) || new Map<string, WebSocket>();
  rooms.set(room, peers);
  peers.get(id)?.close(1008, "Duplicate ID");
  peers.set(id, socket);
  const presence = () => {
    const message = JSON.stringify({ type: "peers", ids: [...peers.keys()] });
    for (const peer of peers.values()) if (peer.readyState === peer.OPEN) peer.send(message);
  };
  presence();
  socket.on("message", (raw) => {
    if (Buffer.byteLength(raw.toString()) > 65536) return;
    try {
      const message = JSON.parse(raw.toString());
      if (message.type !== "signal" || message.signal?.from !== id || typeof message.signal?.to !== "string") return;
      if (!["offer", "answer", "ice", "stop"].includes(message.signal.kind)) return;
      const target = peers.get(message.signal.to);
      if (target && target.readyState === target.OPEN) target.send(JSON.stringify(message));
    } catch { /* Ignore malformed client messages. */ }
  });
  socket.on("close", () => {
    if (peers.get(id) !== socket) return;
    peers.delete(id);
    if (peers.size) presence(); else rooms.delete(room);
  });
});

server.on("listening", () => console.log(`Local signaling on ws://127.0.0.1:${port}`));
