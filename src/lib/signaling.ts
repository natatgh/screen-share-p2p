import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

let sharedClient: SupabaseClient | null = null;
let sharedClientConfig = "";

export type Signal = {
  from: string;
  to: string;
  owner: string;
  kind: "offer" | "answer" | "ice" | "stop";
  data?: RTCSessionDescriptionInit | RTCIceCandidateInit;
};

export type Signaling = {
  send(signal: Signal): void;
  close(): void;
};

type Callbacks = {
  onPeers: (ids: string[]) => void;
  onSignal: (signal: Signal) => void;
  onStatus: (status: string) => void;
};

export type SignalingConfig = { url?: string; key?: string; localHost?: string; production?: boolean };

export function connectRoom(room: string, self: string, callbacks: Callbacks, config: SignalingConfig = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  localHost: process.env.NEXT_PUBLIC_LOCAL_SIGNAL_HOST,
  production: process.env.NODE_ENV === "production",
}): Signaling {
  const { url, key } = config;
  if (url && key) return connectSupabase(room, self, url, key, callbacks);
  if (config.production) {
    callbacks.onStatus("Configure o Supabase Realtime para usar salas no deploy.");
    return { send() {}, close() {} };
  }
  return connectLocal(room, self, callbacks, config.localHost);
}

function connectLocal(room: string, self: string, cb: Callbacks, localHost?: string): Signaling {
  let socket: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const open = () => {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const host = localHost || location.hostname;
    socket = new WebSocket(`${protocol}//${host}:3001/?room=${room}&id=${self}`);
    cb.onStatus("Conectando à sala…");
    socket.onopen = () => cb.onStatus("Conectado");
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "peers") cb.onPeers(message.ids.filter((id: string) => id !== self));
        if (message.type === "signal" && message.signal.to === self) cb.onSignal(message.signal);
      } catch { cb.onStatus("Mensagem de sinalização inválida."); }
    };
    socket.onclose = () => {
      cb.onStatus("Reconectando à sala…");
      cb.onPeers([]);
      if (!closed) retry = setTimeout(open, 1500);
    };
    socket.onerror = () => cb.onStatus("Servidor local indisponível. Use npm run dev.");
  };
  open();
  return {
    send: (signal) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "signal", signal })); },
    close: () => { closed = true; clearTimeout(retry); socket?.close(); },
  };
}

function connectSupabase(room: string, self: string, url: string, key: string, cb: Callbacks): Signaling {
  const config = `${url}:${key}`;
  if (!sharedClient || sharedClientConfig !== config) {
    sharedClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    sharedClientConfig = config;
  }
  const client = sharedClient;
  const channel: RealtimeChannel = client.channel(`screen:${room}`, {
    config: { presence: { key: self }, broadcast: { self: false } },
  });
  channel.on("presence", { event: "sync" }, () => cb.onPeers(Object.keys(channel.presenceState()).filter((id) => id !== self)));
  channel.on("broadcast", { event: "signal" }, ({ payload }) => {
    if (payload?.to === self) cb.onSignal(payload as Signal);
  });
  channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      cb.onStatus("Conectado");
      await channel.track({ joinedAt: Date.now() });
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      cb.onStatus("Falha na sinalização. Tentando reconectar…");
    }
  });
  return {
    send: (signal) => { void channel.send({ type: "broadcast", event: "signal", payload: signal }); },
    close: () => { void client.removeChannel(channel); },
  };
}
