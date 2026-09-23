"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectRoom, type Signal, type Signaling, type SignalingConfig } from "./signaling";
import { readPeerMetrics, type PeerMetrics, type StatsSnapshot } from "./rtc-stats";
import { effectiveSettings, initialAdaptation, nextAdaptation, type AdaptationState } from "./adaptive-quality";
import { applyScreenSettings, captureConstraintsForSettings, contentHintForSettings, defaultStreamSettings, displayCaptureOptions, removeNonTabAudio, type StreamSettings } from "./stream-quality";

const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
type Link = { pc: RTCPeerConnection; pending: RTCIceCandidateInit[] };
type Remote = { id: string; stream: MediaStream };
export type RoomCapture = { start: (settings: StreamSettings) => Promise<MediaStream>; stop?: () => void };
export type RoomOptions = { capture?: RoomCapture; signaling?: SignalingConfig };

export function useRoom(room: string, options?: RoomOptions) {
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; }, [options]);
  const self = useRef<string>("");
  const signaling = useRef<Signaling | null>(null);
  const local = useRef<MediaStream | null>(null);
  const outbound = useRef(new Map<string, Link>());
  const inbound = useRef(new Map<string, Link>());
  const peersRef = useRef<string[]>([]);
  const settingsRef = useRef<StreamSettings>(defaultStreamSettings);
  const adaptation = useRef(new Map<string, AdaptationState>());
  const adaptiveRef = useRef(true);
  const [peers, setPeers] = useState<string[]>([]);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [sharing, setSharing] = useState(false);
  const [settings, setSettingsState] = useState<StreamSettings>(defaultStreamSettings);
  const [adaptiveQuality, setAdaptiveQualityState] = useState(true);
  const [settingsWarning, setSettingsWarning] = useState("");
  const [status, setStatus] = useState("Conectando…");
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState<PeerMetrics[]>([]);

  const send = useCallback((to: string, owner: string, kind: Signal["kind"], data?: Signal["data"]) => {
    signaling.current?.send({ from: self.current, to, owner, kind, data });
  }, []);

  const closeOutbound = useCallback((id: string, notify: boolean) => {
    const link = outbound.current.get(id);
    if (!link) return;
    if (notify) send(id, self.current, "stop");
    link.pc.close();
    outbound.current.delete(id);
    adaptation.current.delete(id);
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
    adaptation.current.set(id, { ...initialAdaptation });
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
    for (const track of stream.getTracks()) {
      const sender = pc.addTrack(track, stream);
      if (track.kind === "video") await applyScreenSettings(sender, settingsRef.current);
    }
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
    optionsRef.current?.capture?.stop?.();
    setLocalStream(null);
    setSharing(false);
  }, [closeOutbound]);

  const setSettings = useCallback(async (next: StreamSettings) => {
    settingsRef.current = next;
    setSettingsState(next);
    setSettingsWarning("");
    adaptation.current.clear();
    const videoTrack = local.current?.getVideoTracks()[0];
    let captureApplied = true;
    if (videoTrack) {
      videoTrack.contentHint = contentHintForSettings(next);
      try { await videoTrack.applyConstraints(captureConstraintsForSettings(next)); }
      catch { captureApplied = false; }
    }
    const updates: Promise<boolean>[] = [];
    for (const link of outbound.current.values()) {
      for (const sender of link.pc.getSenders()) {
        if (sender.track?.kind === "video") updates.push(applyScreenSettings(sender, next));
      }
    }
    const senderApplied = (await Promise.all(updates)).every(Boolean);
    if (!captureApplied || !senderApplied) setSettingsWarning("Seu navegador pode limitar esta combinação. Reinicie a transmissão se a mudança não aparecer.");
  }, []);

  const setAdaptiveQuality = useCallback((enabled: boolean) => {
    adaptiveRef.current = enabled;
    setAdaptiveQualityState(enabled);
    adaptation.current.clear();
    if (!enabled) {
      for (const link of outbound.current.values()) {
        for (const sender of link.pc.getSenders()) {
          if (sender.track?.kind === "video") void applyScreenSettings(sender, settingsRef.current);
        }
      }
    }
  }, []);

  const startSharing = useCallback(async () => {
    setError("");
    if (!optionsRef.current?.capture && !navigator.mediaDevices?.getDisplayMedia) {
      setError("Este navegador não permite capturar a tela neste contexto.");
      return;
    }
    try {
      const stream = optionsRef.current?.capture
        ? await optionsRef.current.capture.start(settingsRef.current)
        : await navigator.mediaDevices.getDisplayMedia(displayCaptureOptions(settingsRef.current));
      if (!stream.getVideoTracks().length) { stream.getTracks().forEach((track) => track.stop()); return; }
      if (!optionsRef.current?.capture) removeNonTabAudio(stream);
      stream.getVideoTracks()[0].contentHint = contentHintForSettings(settingsRef.current);
      local.current = stream;
      setLocalStream(stream);
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
    const currentAdaptation = adaptation.current;
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
    }, optionsRef.current?.signaling);
    return () => {
      signaling.current?.close();
      for (const link of currentOutbound.values()) link.pc.close();
      for (const link of currentInbound.values()) link.pc.close();
      currentOutbound.clear(); currentInbound.clear();
      currentAdaptation.clear();
      local.current?.getTracks().forEach((track) => track.stop());
      local.current = null;
      optionsRef.current?.capture?.stop?.();
    };
  }, [room, closeInbound, closeOutbound, send, startOutbound]);

  useEffect(() => {
    let active = true;
    let polling = false;
    const previous = new Map<string, StatsSnapshot>();
    const poll = async () => {
      if (polling) return;
      polling = true;
      const links = [
        ...[...outbound.current].map(([id, link]) => ({ id, link, direction: "send" as const, current: outbound.current })),
        ...[...inbound.current].map(([id, link]) => ({ id, link, direction: "receive" as const, current: inbound.current })),
      ];
      const result = await Promise.allSettled(links.map(async ({ id, link, direction, current }) => {
        const report = await link.pc.getStats();
        if (current.get(id) !== link) return null;
        const key = `${direction}:${id}`;
        const sample = readPeerMetrics(id, direction, link.pc.connectionState, report, previous.get(key));
        previous.set(key, sample.snapshot);
        return sample.metrics;
      }));
      if (active) {
        const currentKeys = new Set(links.map(({ id, direction }) => `${direction}:${id}`));
        for (const key of previous.keys()) if (!currentKeys.has(key)) previous.delete(key);
        const samples = result.flatMap((item) => item.status === "fulfilled" && item.value ? [item.value] : []);
        if (adaptiveRef.current) {
          for (const sample of samples) {
            if (sample.direction !== "send" || sample.connection !== "connected") continue;
            const link = outbound.current.get(sample.id);
            if (!link) continue;
            const prior = adaptation.current.get(sample.id) ?? { ...initialAdaptation };
            const next = nextAdaptation(prior, sample, settingsRef.current, Date.now());
            adaptation.current.set(sample.id, next);
            if (next.step !== prior.step) {
              const sender = link.pc.getSenders().find((item) => item.track?.kind === "video");
              if (sender) void applyScreenSettings(sender, effectiveSettings(settingsRef.current, next.step));
            }
          }
        }
        setMetrics(samples);
      }
      polling = false;
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => { active = false; clearInterval(timer); };
  }, [room]);

  return { peers, remotes, localStream, sharing, settings, adaptiveQuality, settingsWarning, status, error, metrics, startSharing, stopSharing, setSettings, setAdaptiveQuality };
}
