import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

import { SignalQueue } from "./signal-queue";
import type { PeerInfo } from "./room-policy";

let sharedClient: SupabaseClient | null = null;
let sharedClientConfig = "";

export type Signal = {
  from: string;
  to: string;
  owner: string;
  kind: "offer" | "answer" | "ice" | "stop" | "kick";
  data?: RTCSessionDescriptionInit | RTCIceCandidateInit;
};

export type RoomInfo = { owner: boolean; locked: boolean; selfJoinedAt: number };

export type Signaling = {
  send(signal: Signal): Promise<boolean>;
  setLocked(locked: boolean): void;
  close(): void;
};

type Callbacks = {
  onPeers: (peers: PeerInfo[], info: RoomInfo) => void;
  onSignal: (signal: Signal) => void;
  onStatus: (status: string) => void;
};

export type SignalingConfig = { url?: string; key?: string; localHost?: string; localPort?: string; production?: boolean };

export function connectRoom(room: string, self: string, browserId: string, callbacks: Callbacks, config: SignalingConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  localHost: process.env.NEXT_PUBLIC_LOCAL_SIGNAL_HOST,
  localPort: process.env.NEXT_PUBLIC_LOCAL_SIGNAL_PORT,
  production: process.env.NODE_ENV === "production",
}): Signaling {
  const { url, key } = config;
  if (url && key) return connectSupabase(room, self, browserId, url, key, callbacks);
  if (config.production) {
    callbacks.onStatus("Configure o Supabase Realtime para usar salas no deploy.");
    return { send: async () => false, setLocked() {}, close() {} };
  }
  return connectLocal(room, self, browserId, callbacks, config.localHost, config.localPort);
}

function connectLocal(room: string, self: string, browserId: string, cb: Callbacks, localHost?: string, localPort = "3001"): Signaling {
  let socket: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let lockedState = false;
  const queue = new SignalQueue<Signal>(async (signal) => {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type: "signal", signal }));
    return true;
  });
  const open = () => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const host = localHost || location.hostname;
    socket = new WebSocket(`${protocol}//${host}:${localPort}/?room=${room}&id=${self}&browserId=${browserId}`);
    cb.onStatus("Conectando à sala…");
    socket.onopen = () => {
      queue.setReady(true);
      cb.onStatus("Conectado");
      if (lockedState) socket?.send(JSON.stringify({ type: "lock", locked: lockedState }));
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "peers") {
          const all: { id: string; browserId?: string }[] = message.ids;
          const indexed = all.map((entry, index) => ({ id: entry.id, browserId: entry.browserId, joinedAt: index }));
          const selfIndex = indexed.findIndex((entry) => entry.id === self);
          cb.onPeers(indexed.filter((entry) => entry.id !== self), {
            owner: selfIndex === 0,
            locked: Boolean(message.locked),
            selfJoinedAt: selfIndex === -1 ? 0 : selfIndex,
          });
        }
        if (message.type === "signal" && message.signal.to === self) cb.onSignal(message.signal);
      } catch { cb.onStatus("Mensagem de sinalização inválida."); }
    };
    socket.onclose = () => {
      cb.onStatus("Reconectando à sala…");
      queue.setReady(false);
      if (!closed) retry = setTimeout(open, 1500);
    };
    socket.onerror = () => cb.onStatus("Servidor local indisponível. Use npm run dev.");
  };
  open();
  return {
    send: (signal) => queue.send(signal),
    setLocked: (locked) => { lockedState = locked; if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "lock", locked })); },
    close: () => { closed = true; queue.close(); clearTimeout(retry); socket?.close(); },
  };
}

function connectSupabase(room: string, self: string, browserId: string, url: string, key: string, cb: Callbacks): Signaling {
  const config = `${url}:${key}`;
  if (!sharedClient || sharedClientConfig !== config) {
    sharedClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    sharedClientConfig = config;
  }
  const client = sharedClient;
  const channel: RealtimeChannel = client.channel(`screen:${room}`, {
    config: { presence: { key: self }, broadcast: { self: false, ack: true } },
  });
  const queue = new SignalQueue<Signal>(async (signal) =>
    (await channel.send({ type: "broadcast", event: "signal", payload: signal })) === "ok");
  let closed = false;
  let selfJoinedAt = 0;
  let lockedState = false;
  channel.on("presence", { event: "sync" }, () => {
    const state = channel.presenceState() as Record<string, { joinedAt?: number; browserId?: string; locked?: boolean }[]>;
    const entries = Object.entries(state)
      .map(([id, metas]) => ({ id, joinedAt: metas[0]?.joinedAt ?? Infinity, browserId: metas[0]?.browserId, locked: Boolean(metas[0]?.locked) }))
      .sort((a, b) => a.joinedAt - b.joinedAt);
    const owner = entries[0]?.id === self;
    cb.onPeers(entries.filter((entry) => entry.id !== self).map(({ id, joinedAt, browserId: peerBrowserId }) => ({ id, joinedAt, browserId: peerBrowserId })), {
      owner,
      locked: entries[0]?.locked ?? false,
      selfJoinedAt,
    });
  });
  channel.on("broadcast", { event: "signal" }, ({ payload }) => {
    if (payload?.to === self) cb.onSignal(payload as Signal);
  });
  channel.subscribe(async (status) => {
    if (closed) return;
    queue.setReady(status === "SUBSCRIBED");
    if (status === "SUBSCRIBED") {
      cb.onStatus("Conectado");
      selfJoinedAt = selfJoinedAt || Date.now();
      if (await channel.track({ joinedAt: selfJoinedAt, browserId, locked: lockedState }) !== "ok" && !closed) cb.onStatus("Falha ao publicar presença. Tentando reconectar…");
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      cb.onStatus("Falha na sinalização. Tentando reconectar…");
    }
  });
  return {
    send: (signal) => queue.send(signal),
    setLocked: (locked) => { lockedState = locked; void channel.track({ joinedAt: selfJoinedAt, browserId, locked }); },
    close: () => { closed = true; queue.close(); void client.removeChannel(channel); },
  };
}
