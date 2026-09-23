"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectRoom, type Signal, type Signaling } from "./signaling";

const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
type Link = { pc: RTCPeerConnection; pending: RTCIceCandidateInit[] };
type Remote = { id: string; stream: MediaStream };

export function useRoom(room: string) {
  const self = useRef<string>("");
  const signaling = useRef<Signaling | null>(null);
  const local = useRef<MediaStream | null>(null);
  const outbound = useRef(new Map<string, Link>());
  const inbound = useRef(new Map<string, Link>());
  const peersRef = useRef<string[]>([]);
  const [peers, setPeers] = useState<string[]>([]);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [sharing, setSharing] = useState(false);
  const [status, setStatus] = useState("Conectando…");
  const [error, setError] = useState("");

  const send = useCallback((to: string, owner: string, kind: Signal["kind"], data?: Signal["data"]) => {
    signaling.current?.send({ from: self.current, to, owner, kind, data });
  }, []);

  const closeOutbound = useCallback((id: string, notify: boolean) => {
    const link = outbound.current.get(id);
    if (!link) return;
    if (notify) send(id, self.current, "stop");
    link.pc.close();
    outbound.current.delete(id);
  }, [send]);

  const closeInbound = useCallback((id: string) => {
    inbound.current.get(id)?.pc.close();
    inbound.current.delete(id);
    setRemotes((current) => current.filter((remote) => remote.id !== id));
  }, []);

  const startOutbound = useCallback(async (id: string, stream: MediaStream) => {
    if (outbound.current.has(id)) return;
    const pc = new RTCPeerConnection({ iceServers });
    const link: Link = { pc, pending: [] };
    outbound.current.set(id, link);
    let offered = false;
    const earlyIce: RTCIceCandidateInit[] = [];
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const candidate = event.candidate.toJSON();
      if (offered) send(id, self.current, "ice", candidate); else earlyIce.push(candidate);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        setError("Conexão P2P falhou. A rede pode exigir um servidor TURN.");
        closeOutbound(id, false);
      }
    };
    for (const track of stream.getTracks()) pc.addTrack(track, stream);
    try {
      await pc.setLocalDescription(await pc.createOffer());
      send(id, self.current, "offer", pc.localDescription?.toJSON());
      offered = true;
      for (const candidate of earlyIce) send(id, self.current, "ice", candidate);
    } catch {
      closeOutbound(id, false);
      setError("Não foi possível iniciar a transmissão para um participante.");
    }
  }, [closeOutbound, send]);

  const stopSharing = useCallback(() => {
    for (const id of [...outbound.current.keys()]) closeOutbound(id, true);
    local.current?.getTracks().forEach((track) => track.stop());
    local.current = null;
    setSharing(false);
  }, [closeOutbound]);

  const startSharing = useCallback(async () => {
    setError("");
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Este navegador não permite capturar a tela neste contexto.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (!stream.getVideoTracks().length) { stream.getTracks().forEach((track) => track.stop()); return; }
      local.current = stream;
      stream.getVideoTracks()[0].addEventListener("ended", stopSharing, { once: true });
      setSharing(true);
      for (const id of peersRef.current) void startOutbound(id, stream);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "NotAllowedError") return;
      setError("Não foi possível capturar a tela. Confira a permissão do navegador.");
    }
  }, [startOutbound, stopSharing]);

  useEffect(() => {
    self.current = crypto.randomUUID();
    const currentOutbound = outbound.current;
    const currentInbound = inbound.current;
    signaling.current = connectRoom(room, self.current, {
      onStatus: setStatus,
      onPeers: (ids) => {
        peersRef.current = ids;
        setPeers(ids);
        for (const id of [...currentOutbound.keys()]) if (!ids.includes(id)) closeOutbound(id, false);
        for (const id of [...currentInbound.keys()]) if (!ids.includes(id)) closeInbound(id);
        if (local.current) for (const id of ids) void startOutbound(id, local.current);
      },
      onSignal: async (signal) => {
        if (signal.owner === self.current && signal.kind === "answer") {
          const link = currentOutbound.get(signal.from);
          if (!link || !signal.data) return;
          try {
            await link.pc.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
            for (const candidate of link.pending.splice(0)) await link.pc.addIceCandidate(candidate);
          } catch { setError("Falha ao negociar a conexão P2P."); }
          return;
        }
        if (signal.kind === "stop" && signal.owner === signal.from) { closeInbound(signal.from); return; }
        if (signal.kind === "offer" && signal.owner === signal.from && signal.data) {
          closeInbound(signal.from);
          const pc = new RTCPeerConnection({ iceServers });
          const link: Link = { pc, pending: [] };
          currentInbound.set(signal.from, link);
          let answered = false;
          const earlyIce: RTCIceCandidateInit[] = [];
          pc.onicecandidate = (event) => {
            if (!event.candidate) return;
            const candidate = event.candidate.toJSON();
            if (answered) send(signal.from, signal.from, "ice", candidate); else earlyIce.push(candidate);
          };
          pc.ontrack = (event) => {
            const stream = event.streams[0] || new MediaStream([event.track]);
            setRemotes((current) => [...current.filter((remote) => remote.id !== signal.from), { id: signal.from, stream }]);
          };
          pc.onconnectionstatechange = () => {
            if (pc.connectionState === "failed") {
              setError("Conexão P2P falhou. A rede pode exigir um servidor TURN.");
              closeInbound(signal.from);
            }
          };
          try {
            await pc.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
            await pc.setLocalDescription(await pc.createAnswer());
            send(signal.from, signal.from, "answer", pc.localDescription?.toJSON());
            answered = true;
            for (const candidate of earlyIce) send(signal.from, signal.from, "ice", candidate);
            for (const candidate of link.pending.splice(0)) await pc.addIceCandidate(candidate);
          } catch { closeInbound(signal.from); setError("Falha ao receber a transmissão."); }
          return;
        }
        if (signal.kind === "ice" && signal.data) {
          const link = signal.owner === self.current ? currentOutbound.get(signal.from) : currentInbound.get(signal.from);
          if (!link) return;
          const candidate = signal.data as RTCIceCandidateInit;
          if (link.pc.remoteDescription) void link.pc.addIceCandidate(candidate).catch(() => {});
          else link.pending.push(candidate);
        }
      },
    });
    return () => {
      signaling.current?.close();
      for (const link of currentOutbound.values()) link.pc.close();
      for (const link of currentInbound.values()) link.pc.close();
      currentOutbound.clear(); currentInbound.clear();
      local.current?.getTracks().forEach((track) => track.stop());
      local.current = null;
    };
  }, [room, closeInbound, closeOutbound, send, startOutbound]);

  return { peers, remotes, sharing, status, error, startSharing, stopSharing };
}
