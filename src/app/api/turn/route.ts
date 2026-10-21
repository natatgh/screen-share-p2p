// Mints short-lived Cloudflare Realtime TURN credentials (ADR 010). Falls back
// to STUN-only when the backend isn't configured, so local dev needs no setup.
const STUN_ONLY: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const TTL_SECONDS = 3600;

export async function GET() {
  const tokenId = process.env.CLOUDFLARE_TURN_TOKEN_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!tokenId || !apiToken) return Response.json({ iceServers: STUN_ONLY });

  try {
    const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${tokenId}/credentials/generate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: TTL_SECONDS }),
    });
    if (!response.ok) return Response.json({ iceServers: STUN_ONLY });
    const data = await response.json();
    const turn = data?.iceServers;
    if (!turn?.urls || !turn.username || !turn.credential) return Response.json({ iceServers: STUN_ONLY });
    return Response.json({ iceServers: [...STUN_ONLY, turn] });
  } catch {
    return Response.json({ iceServers: STUN_ONLY });
  }
}
