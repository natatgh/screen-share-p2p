import test from "node:test";
import assert from "node:assert/strict";
import { fetchIceServers } from "../src/lib/turn-credentials";

const STUN_ONLY = [{ urls: "stun:stun.l.google.com:19302" }];

test("returns the server's iceServers on a successful response", async (t) => {
  const turnServers = [...STUN_ONLY, { urls: ["turn:turn.cloudflare.com:3478"], username: "u", credential: "c" }];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(url, "/api/turn");
    return new Response(JSON.stringify({ iceServers: turnServers }), { status: 200 });
  });
  assert.deepEqual(await fetchIceServers(), turnServers);
});

test("falls back to STUN-only on a non-OK response", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("", { status: 500 }));
  assert.deepEqual(await fetchIceServers(), STUN_ONLY);
});

test("falls back to STUN-only when the network call throws", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  assert.deepEqual(await fetchIceServers(), STUN_ONLY);
});

test("falls back to STUN-only on a malformed payload", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ iceServers: [] }), { status: 200 }));
  assert.deepEqual(await fetchIceServers(), STUN_ONLY);
});

test("prefixes the fetch with the provided base URL, for the desktop app", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(url, "https://lumen.example/api/turn");
    return new Response(JSON.stringify({ iceServers: STUN_ONLY }), { status: 200 });
  });
  assert.deepEqual(await fetchIceServers("https://lumen.example"), STUN_ONLY);
});
