import { createClient } from "@supabase/supabase-js";
import { connectRoom, type Signaling } from "../src/lib/signaling";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Configure .env.local antes de testar o Realtime.");
const room = `SMOKE${Date.now()}`;
const bob = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const channel = bob.channel(`screen:${room}`, { config: { presence: { key: "bob" } } });
let alice: Signaling | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

async function run() {
  const broadcast = new Promise<void>((resolve) => channel.on("broadcast", { event: "signal" }, ({ payload }) => {
    if (payload?.from === "alice" && payload?.to === "bob") resolve();
  }));
  await new Promise<void>((resolve, reject) => channel.subscribe((status) => {
    if (status === "SUBSCRIBED") resolve();
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(status));
  }));
  await channel.track({ online: true });
  let present!: () => void;
  const presence = new Promise<void>((resolve) => { present = resolve; });
  alice = connectRoom(room, "alice", { onStatus() {}, onSignal() {}, onPeers: (peers) => { if (peers.includes("bob")) present(); } }, { url, key, production: true });
  // Exercise the real adapter's bounded pre-subscription queue and server ACK.
  if (!await alice.send({ from: "alice", to: "bob", owner: "alice", kind: "offer", data: { type: "offer", sdp: "smoke" } })) throw new Error("Broadcast não foi confirmado.");
  await Promise.all([broadcast, presence]);
  console.log("Supabase Realtime: adaptador, fila, ACK, presença e Broadcast funcionando.");
}

void Promise.race([run(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Tempo esgotado no Realtime.")), 15_000); })])
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => { clearTimeout(timer); alice?.close(); await bob.removeChannel(channel); bob.realtime.disconnect(); });
