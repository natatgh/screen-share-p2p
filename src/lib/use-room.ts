"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectRoom, type Signal, type Signaling, type SignalingConfig } from "./signaling";
import { readPeerMetrics, type PeerMetrics, type StatsSnapshot } from "./rtc-stats";
import { effectiveSettings, initialAdaptation, nextAdaptation, sharedBitrateBudget, type AdaptationState } from "./adaptive-quality";
import { applyScreenSettings, captureConstraintsForSettings, contentHintForSettings, defaultStreamSettings, displayCaptureOptions, removeUnscopedWindowAudio, type StreamSettings } from "./stream-quality";

import { DiagnosticReport, playbackFps, type RuntimeMetrics } from "./diagnostic-report";
import { preferVideoCodec } from "./codec-preference";
import { PeerRecovery, candidateMatchesDescription } from "./peer-recovery";

const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
type Link = { pc: RTCPeerConnection; pending: RTCIceCandidateInit[]; recovery?: PeerRecovery; renegotiate?: () => Promise<void> };
type Remote = { id: string; stream: MediaStream };
export type RoomCapture = { start: (settings: StreamSettings) => Promise<MediaStream>; stop?: () => void };
export type RoomOptions = { capture?: RoomCapture; signaling?: SignalingConfig; runtimeMetrics?: () => Promise<RuntimeMetrics> };

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
  const globalAdaptation = useRef<AdaptationState>({ ...initialAdaptation });
  const captureStep = useRef(0);
  const report = useRef(new DiagnosticReport());
  const statusRef = useRef("Conectando…");
  const [peers, setPeers] = useState<string[]>([]);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [sharing, setSharing] = useState(false);
  const [settings, setSettingsState] = useState<StreamSettings>(defaultStreamSettings);
  const [adaptiveQuality, setAdaptiveQualityState] = useState(true);
  const [settingsWarning, setSettingsWarning] = useState("");
  const [status, setStatus] = useState("Conectando…");
  const [error, setError] = useState("");
  const [runtime, setRuntime] = useState<RuntimeMetrics | undefined>();
  const [metrics, setMetrics] = useState<PeerMetrics[]>([]);

  const send = useCallback((to: string, owner: string, kind: Signal["kind"], data?: Signal["data"]) => {
    return signaling.current?.send({ from: self.current, to, owner, kind, data }) ?? Promise.resolve(false);
  }, []);

  const closeOutbound = useCallback((id: string, notify: boolean) => {
    const link = outbound.current.get(id);
    if (!link) return;
    if (notify) send(id, self.current, "stop");
    link.recovery?.close();
    link.pc.close();
    outbound.current.delete(id);
    adaptation.current.delete(id);
  }, [send]);

  const closeInbound = useCallback((id: string) => {
    inbound.current.get(id)?.pc.close();
    inbound.current.delete(id);
    setRemotes((current) => current.filter((remote) => remote.id !== id));
  }, []);

  const startOutbound = useCallback(async function startLink(id: string, stream: MediaStream) {
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
    const offer = async (restart = false) => {
      if (outbound.current.get(id) !== link || local.current !== stream) return;
      if (pc.signalingState !== "stable") throw new Error("Negotiation pending");
      offered = false;
      preferVideoCodec(pc, settingsRef.current.codec);
      if (restart) pc.restartIce();
      await pc.setLocalDescription(await pc.createOffer());
      if (!await send(id, self.current, "offer", pc.localDescription?.toJSON())) {
        await pc.setLocalDescription({ type: "rollback" });
        throw new Error("Signal unavailable");
      }
      if (outbound.current.get(id) !== link) return;
      offered = true;
      for (const candidate of earlyIce.splice(0)) void send(id, self.current, "ice", candidate);
    };
    link.renegotiate = () => offer();
    link.recovery = new PeerRecovery(async () => {
      // An unanswered offer cannot be restarted: rebuild after the second timeout.
      if (pc.signalingState === "have-local-offer") throw new Error("Answer timeout");
      await offer(true);
    }, () => {
      closeOutbound(id, false);
      if (local.current === stream && peersRef.current.includes(id)) {
        setError("Reconectando a transmissão. Redes restritas podem exigir TURN.");
        void startLink(id, stream);
      }
    });
    pc.onconnectionstatechange = () => {
      link.recovery?.state(pc.connectionState);
      if (pc.connectionState === "connected") setError("");
    };
    for (const track of stream.getTracks()) {
      const sender = pc.addTrack(track, stream);
      if (track.kind === "video") await applyScreenSettings(sender, settingsRef.current);
    }
    try { await offer(); }
    catch { setError("Sinalização indisponível. Tentando novamente…"); }
    link.recovery.negotiating();
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
    const codecChanged = next.codec !== settingsRef.current.codec;
    settingsRef.current = next;
    setSettingsState(next);
    setSettingsWarning("");
    adaptation.current.clear();
    globalAdaptation.current = { ...initialAdaptation };
    captureStep.current = 0;
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
    if (codecChanged) {
      for (const link of outbound.current.values()) {
        try { await link.renegotiate?.(); } catch { link.recovery?.state("failed"); }
      }
    }
    if (!captureApplied || !senderApplied) setSettingsWarning("Seu navegador pode limitar esta combinação. Reinicie a transmissão se a mudança não aparecer.");
  }, []);

  const setAdaptiveQuality = useCallback((enabled: boolean) => {
    adaptiveRef.current = enabled;
    setAdaptiveQualityState(enabled);
    adaptation.current.clear();
    if (!enabled) {
      globalAdaptation.current = { ...initialAdaptation };
      captureStep.current = 0;
      const track = local.current?.getVideoTracks()[0];
      if (track) void track.applyConstraints(captureConstraintsForSettings(settingsRef.current)).catch(() => setSettingsWarning("Não foi possível restaurar a captura."));
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
      if (!optionsRef.current?.capture && removeUnscopedWindowAudio(stream)) setSettingsWarning("Áudio de janela isolado está disponível no Lumen Desktop. No navegador, escolha uma aba para som isolado ou um monitor para áudio do sistema.");
      stream.getVideoTracks()[0].contentHint = contentHintForSettings(settingsRef.current);
      globalAdaptation.current = { ...initialAdaptation };
      captureStep.current = 0;
      adaptation.current.clear();
      local.current = stream;
      setLocalStream(stream);
      stream.getVideoTracks()[0].addEventListener("ended", stopSharing, { once: true });
      report.current.reset();
      setSharing(true);
      for (const id of peersRef.current) void startOutbound(id, stream);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "NotAllowedError") return;
      setError("Não foi possível capturar a tela. Confira a permissão do navegador.");
    }
  }, [startOutbound, stopSharing]);

  useEffect(() => {
    self.current = crypto.randomUUID();
    report.current.reset();
    const currentOutbound = outbound.current;
    const currentInbound = inbound.current;
    const currentAdaptation = adaptation.current;
    signaling.current = connectRoom(room, self.current, {
      onStatus: (value) => { statusRef.current = value; setStatus(value); },
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
            for (const candidate of link.pending.splice(0)) if (candidateMatchesDescription(candidate, link.pc.remoteDescription)) await link.pc.addIceCandidate(candidate);
          } catch { setError("Falha ao negociar a conexão P2P."); }
          return;
        }
        if (signal.kind === "stop" && signal.owner === signal.from) { closeInbound(signal.from); return; }
        if (signal.kind === "offer" && signal.owner === signal.from && signal.data) {
          const existing = currentInbound.get(signal.from);
          const pc = existing?.pc ?? new RTCPeerConnection({ iceServers });
          const link: Link = existing ?? { pc, pending: [] };
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
            if (pc.connectionState === "failed") setError("Reconectando a transmissão. Aguardando quem está transmitindo…");
            if (pc.connectionState === "connected") setError("");
          };
          try {
            await pc.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
            await pc.setLocalDescription(await pc.createAnswer());
            if (!await send(signal.from, signal.from, "answer", pc.localDescription?.toJSON())) throw new Error("Signal unavailable");
            answered = true;
            for (const candidate of earlyIce) send(signal.from, signal.from, "ice", candidate);
            for (const candidate of link.pending.splice(0)) if (candidateMatchesDescription(candidate, pc.remoteDescription)) await pc.addIceCandidate(candidate);
          } catch { closeInbound(signal.from); setError("Falha ao receber a transmissão."); }
          return;
        }
        if (signal.kind === "ice" && signal.data) {
          const link = signal.owner === self.current ? currentOutbound.get(signal.from) : currentInbound.get(signal.from);
          if (!link) return;
          const candidate = signal.data as RTCIceCandidateInit;
          if (link.pc.remoteDescription) { if (candidateMatchesDescription(candidate, link.pc.remoteDescription)) void link.pc.addIceCandidate(candidate).catch(() => {}); }
          else link.pending.push(candidate);
        }
      },
    }, optionsRef.current?.signaling);
    return () => {
      signaling.current?.close();
      for (const link of currentOutbound.values()) { link.recovery?.close(); link.pc.close(); }
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
        if (direction === "receive") sample.metrics.renderedFps = playbackFps(link.pc.getReceivers().find((receiver) => receiver.track.kind === "video")?.track) ?? sample.metrics.renderedFps;
        return sample.metrics;
      }));
      if (active) {
        const currentKeys = new Set(links.map(({ id, direction }) => `${direction}:${id}`));
        for (const key of previous.keys()) if (!currentKeys.has(key)) previous.delete(key);
        const samples = result.flatMap((item) => item.status === "fulfilled" && item.value ? [item.value] : []);
        const senders = samples.filter((sample) => sample.direction === "send" && sample.connection === "connected");
        if (adaptiveRef.current) {
          const cpuSample = senders.find((sample) => sample.qualityLimitationReason === "cpu");
          const healthySample = senders.find((sample) => sample.qualityLimitationReason === "none");
          if (cpuSample || healthySample) globalAdaptation.current = nextAdaptation(globalAdaptation.current, { ...(cpuSample ?? healthySample!), rttMs: null, lossPercent: null, captureFps: cpuSample?.captureFps ?? null }, settingsRef.current, Date.now());
          const globalStep = globalAdaptation.current.step;
          const track = local.current?.getVideoTracks()[0];
          if (track && captureStep.current !== globalStep) {
            try { await track.applyConstraints(captureConstraintsForSettings(effectiveSettings(settingsRef.current, globalStep))); captureStep.current = globalStep; }
            catch { setSettingsWarning("O navegador não conseguiu reduzir a captura automaticamente."); }
          }
        }
        // The explicit upload ceiling applies even with automatic quality off.
        const budget = sharedBitrateBudget(samples, settingsRef.current.uploadBudgetMbps);
        {
          const globalStep = adaptiveRef.current ? globalAdaptation.current.step : 0;
          for (const sample of senders) {
            const link = outbound.current.get(sample.id);
            if (!link) continue;
            const prior = adaptation.current.get(sample.id) ?? { ...initialAdaptation };
            const next = adaptiveRef.current ? nextAdaptation(prior, sample, settingsRef.current, Date.now()) : { ...initialAdaptation };
            adaptation.current.set(sample.id, next);
            const sender = link.pc.getSenders().find((item) => item.track?.kind === "video");
            if (sender) {
              const effective = effectiveSettings(settingsRef.current, Math.max(globalStep, next.step) as 0 | 1 | 2);
              const peerBudget = sample.availableOutgoingKbps !== null && sample.availableOutgoingKbps > 0 ? sample.availableOutgoingKbps * 800 : Infinity;
              const limit = Math.min(budget ?? Infinity, peerBudget);
              if (!await applyScreenSettings(sender, effective, Number.isFinite(limit) ? limit : undefined)) setSettingsWarning("Seu navegador limitou o ajuste automático do envio.");
            }
          }
        }
        let runtime: RuntimeMetrics | undefined;
        try { if (links.length) runtime = await optionsRef.current?.runtimeMetrics?.(); } catch { /* Optional platform diagnostics. */ }
        if (!active) { polling = false; return; }
        setRuntime(runtime);
        report.current.add(statusRef.current, settingsRef.current, samples, runtime);
        setMetrics(samples);
      }
      polling = false;
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => { active = false; clearInterval(timer); };
  }, [room]);

  const exportDiagnostics = useCallback(() => {
    const url = URL.createObjectURL(new Blob([report.current.serialize()], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "lumen-diagnostics.json"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  return { runtime, exportDiagnostics, peers, remotes, localStream, sharing, settings, adaptiveQuality, settingsWarning, status, error, metrics, startSharing, stopSharing, setSettings, setAdaptiveQuality };
}
