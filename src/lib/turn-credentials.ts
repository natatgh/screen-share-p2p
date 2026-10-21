const STUN_ONLY: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const FETCH_TIMEOUT_MS = 3000;

// Server-minted, short-lived TURN credentials for NAT-restricted networks (ADR 010).
// Falls back to STUN-only on any failure so a missing/misconfigured TURN backend
// never blocks a room join.
export async function fetchIceServers(baseUrl = ""): Promise<RTCIceServer[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/api/turn`, { signal: controller.signal });
    if (!response.ok) return STUN_ONLY;
    const data = await response.json();
    return Array.isArray(data?.iceServers) && data.iceServers.length ? data.iceServers : STUN_ONLY;
  } catch {
    return STUN_ONLY;
  } finally {
    clearTimeout(timer);
  }
}
