import { WebSocketServer, type WebSocket } from "ws";

const port = Number(process.env.SIGNAL_PORT || 3001);
const server = new WebSocketServer({ port, host: "127.0.0.1" });
type Room = { peers: Map<string, WebSocket>; locked: boolean };
const rooms = new Map<string, Room>();

server.on("connection", (socket, request) => {
  const url = new URL(request.url || "/", "http://localhost");
  const room = url.searchParams.get("room") || "";
  const id = url.searchParams.get("id") || "";
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(room) || !/^[a-f0-9-]{36}$/.test(id)) return socket.close(1008, "Invalid room or ID");
  const state = rooms.get(room) || { peers: new Map<string, WebSocket>(), locked: false };
  rooms.set(room, state);
  state.peers.get(id)?.close(1008, "Duplicate ID");
  state.peers.set(id, socket);
  const presence = () => {
    const message = JSON.stringify({ type: "peers", ids: [...state.peers.keys()], locked: state.locked });
    for (const peer of state.peers.values()) if (peer.readyState === peer.OPEN) peer.send(message);
  };
  presence();
  socket.on("message", (raw) => {
    if (Buffer.byteLength(raw.toString()) > 65536) return;
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === "lock" && typeof message.locked === "boolean") {
        if ([...state.peers.keys()][0] !== id) return;
        state.locked = message.locked;
        presence();
        return;
      }
      if (message.type !== "signal" || message.signal?.from !== id || typeof message.signal?.to !== "string") return;
      if (!["offer", "answer", "ice", "stop", "kick"].includes(message.signal.kind)) return;
      const target = state.peers.get(message.signal.to);
      if (target && target.readyState === target.OPEN) target.send(JSON.stringify(message));
    } catch { /* Ignore malformed client messages. */ }
  });
  socket.on("close", () => {
    if (state.peers.get(id) !== socket) return;
    state.peers.delete(id);
    if (state.peers.size) presence(); else rooms.delete(room);
  });
});

server.on("listening", () => console.log(`Local signaling on ws://127.0.0.1:${port}`));
