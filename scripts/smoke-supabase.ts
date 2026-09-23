import { createClient, type RealtimeChannel } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Configure .env.local antes de testar o Realtime.");

const topic = `screen:SMOKE${Date.now()}`;
const alice = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const bob = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const channelA = alice.channel(topic, { config: { presence: { key: "alice" } } });
const channelB = bob.channel(topic, { config: { presence: { key: "bob" } } });

function subscribe(channel: RealtimeChannel): Promise<void> {
  return new Promise((resolve, reject) => channel.subscribe((status, error) => {
    if (status === "SUBSCRIBED") resolve();
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(error || new Error(status));
  }));
}

async function main() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Tempo esgotado no teste do Realtime.")), 15_000);
  });
  try {
    await Promise.race([run(), timeout]);
  } finally {
    clearTimeout(timer);
    await Promise.all([alice.removeChannel(channelA), bob.removeChannel(channelB)]);
    alice.realtime.disconnect();
    bob.realtime.disconnect();
  }
}

async function run() {
  const bothPresent = new Promise<void>((resolve) => {
    channelA.on("presence", { event: "sync" }, () => {
      const ids = Object.keys(channelA.presenceState());
      if (ids.includes("alice") && ids.includes("bob")) resolve();
    });
  });
  const broadcastReceived = new Promise<void>((resolve) => {
    channelB.on("broadcast", { event: "signal" }, ({ payload }) => {
      if (payload?.from === "alice" && payload?.to === "bob") resolve();
    });
  });
  await Promise.all([subscribe(channelA), subscribe(channelB)]);
  await Promise.all([channelA.track({ online: true }), channelB.track({ online: true })]);
  await bothPresent;
  const result = await channelA.send({ type: "broadcast", event: "signal", payload: { from: "alice", to: "bob", kind: "offer" } });
  if (result !== "ok") throw new Error(`Broadcast falhou: ${result}`);
  await broadcastReceived;
  console.log("Supabase Realtime: presença e Broadcast funcionando.");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
