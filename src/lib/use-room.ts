"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectRoom, type Signal, type Signaling, type SignalingConfig } from "./signaling";
import { readPeerMetrics, type PeerMetrics, type StatsSnapshot } from "./rtc-stats";
import { effectiveSettings, initialAdaptation, nextAdaptation, sharedBitrateBudget, type AdaptationState } from "./adaptive-quality";
import { applyScreenSettings, captureConstraintsForSettings, contentHintForSettings, defaultStreamSettings, displayCaptureOptions, removeUnscopedWindowAudio, type StreamSettings } from "./stream-quality";

import { DiagnosticReport, playbackFps, type RuntimeMetrics } from "./diagnostic-report";
import { preferVideoCodec } from "./codec-preference";
import { PeerRecovery, candidateMatchesDescription } from "./peer-recovery";
import { fetchIceServers } from "./turn-credentials";
import { acquireRoomLock } from "./room-lock";
import { isLockedOut } from "./room-policy";

const STUN_ONLY: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
type Link = { pc: RTCPeerConnection; pending: RTCIceCandidateInit[]; recovery?: PeerRecovery; renegotiate?: () => Promise<void> };
type Remote = { id: string; stream: MediaStream };
type TrackFactory = () => Promise<MediaStreamTrack>;
export type RoomCapture = {
  start: (settings: StreamSettings) => Promise<MediaStream>;
  stop?: () => void;
  /** Lets the platform move a live share to another source (the desktop app follows a game's windows). */
  onSourceChange?: (listener: (next: TrackFactory) => void) => () => void;
};
/** How long a lost source may stay gone before the share ends, when the platform can follow it elsewhere. */
const SOURCE_RETURN_GRACE_MS = 60_000;
export type RoomOptions = { capture?: RoomCapture; signaling?: SignalingConfig; runtimeMetrics?: () => Promise<RuntimeMetrics>; turnBaseUrl?: string };

export function useRoom(room: string, options?: RoomOptions) {
  const optionsRef = useRef(options);
  useEffect(() => { optionsRef.current = options; }, [options]);
  const self = useRef<string>("");
  const ownerRef = useRef(false);
  const firstSync = useRef(true);
  const iceServersRef = useRef<RTCIceServer[]>(STUN_ONLY);
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
  const [owner, setOwner] = useState(false);
  const [roomLocked, setRoomLocked] = useState(false);
  const [lockedOut, setLockedOut] = useState(false);
  const [kicked, setKicked] = useState(false);
  const [duplicateTab, setDuplicateTab] = useState(false);
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
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
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

  const sourceLostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSourceLost = useCallback(() => {
    if (sourceLostTimer.current) clearTimeout(sourceLostTimer.current);
    sourceLostTimer.current = null;
  }, []);

  const stopSharing = useCallback(() => {
    clearSourceLost();
    for (const id of [...outbound.current.keys()]) closeOutbound(id, true);
    local.current?.getTracks().forEach((track) => track.stop());
    local.current = null;
    optionsRef.current?.capture?.stop?.();
    setLocalStream(null);
    setSharing(false);
  }, [closeOutbound, clearSourceLost]);

  // A source that can be followed elsewhere gets a grace period to be replaced before the share ends.
  const endShareWhenSourceEnds = useCallback((track: MediaStreamTrack) => {
    track.addEventListener("ended", () => {
      if (!optionsRef.current?.capture?.onSourceChange) { stopSharing(); return; }
      clearSourceLost();
      sourceLostTimer.current = setTimeout(stopSharing, SOURCE_RETURN_GRACE_MS);
    }, { once: true });
  }, [stopSharing, clearSourceLost]);

  const swapVideoTrack = useCallback(async (next: TrackFactory) => {
    const stream = local.current;
    const previous = stream?.getVideoTracks()[0];
    if (!stream || !previous) return;
    let track: MediaStreamTrack;
    try { track = await next(); }
    catch { setError("Não foi possível acompanhar a janela do aplicativo."); return; }
    if (local.current !== stream) { track.stop(); return; }
    track.contentHint = contentHintForSettings(settingsRef.current);
    try { await track.applyConstraints(captureConstraintsForSettings(effectiveSettings(settingsRef.current, captureStep.current as 0 | 1 | 2))); }
    catch { setSettingsWarning("O navegador não conseguiu aplicar a qualidade à nova janela."); }
    const replaced = [...outbound.current.values()].flatMap((link) => link.pc.getSenders().filter((sender) => sender.track?.kind === "video").map((sender) => sender.replaceTrack(track)));
    await Promise.allSettled(replaced);
    clearSourceLost();
    stream.removeTrack(previous);
    previous.stop();
    stream.addTrack(track);
    endShareWhenSourceEnds(track);
    setError("");
  }, [clearSourceLost, endShareWhenSourceEnds]);

  useEffect(() => {
    if (!sharing) return;
    return optionsRef.current?.capture?.onSourceChange?.((next) => void swapVideoTrack(next));
  }, [sharing, swapVideoTrack]);

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
      if (!optionsRef.current?.capture && removeUnscopedWindowAudio(stream)) setSettingsWarning("Este navegador não isolou o áudio desta fonte; o som foi removido para evitar compartilhar o áudio do sistema sem querer.");
      stream.getVideoTracks()[0].contentHint = contentHintForSettings(settingsRef.current);
      globalAdaptation.current = { ...initialAdaptation };
      captureStep.current = 0;
      adaptation.current.clear();
      local.current = stream;
      setLocalStream(stream);
      endShareWhenSourceEnds(stream.getVideoTracks()[0]);
      report.current.reset();
      setSharing(true);
      for (const id of peersRef.current) void startOutbound(id, stream);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "NotAllowedError") return;
      setError("Não foi possível capturar a tela. Confira a permissão do navegador.");
    }
  }, [startOutbound, endShareWhenSourceEnds]);

  // The screen can sleep mid-presentation and kill capture; a wake lock avoids
  // that. The OS/browser releases it whenever the tab goes hidden, so reacquire
  // once it is visible again.
  useEffect(() => {
    if (!sharing) return;
    let lock: WakeLockSentinel | null = null;
    const acquire = async () => {
      try { lock = (await navigator.wakeLock?.request("screen")) ?? null; } catch { /* Best effort; unsupported or denied. */ }
    };
    void acquire();
    const onVisible = () => { if (document.visibilityState === "visible" && !lock) void acquire(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [sharing]);

  useEffect(() => {
    self.current = crypto.randomUUID();
    firstSync.current = true;
    setOwner(false); setRoomLocked(false); setLockedOut(false); setKicked(false); setDuplicateTab(false);
    report.current.reset();
    void fetchIceServers(optionsRef.current?.turnBaseUrl).then((servers) => { iceServersRef.current = servers; });
    const currentOutbound = outbound.current;
    const currentInbound = inbound.current;
    const currentAdaptation = adaptation.current;
    let cancelled = false;
    let releaseLock = () => {};
    const connect = () => {
      signaling.current = connectRoom(room, self.current, {
        onStatus: (value) => { statusRef.current = value; setStatus(value); },
        onPeers: (ids, info) => {
          ownerRef.current = info.owner;
          setOwner(info.owner);
          setRoomLocked(info.locked);
          if (firstSync.current && isLockedOut(info.locked, info.owner)) {
            firstSync.current = false;
            setLockedOut(true);
            signaling.current?.close();
            return;
          }
          firstSync.current = false;
          peersRef.current = ids;
          setPeers(ids);
          for (const id of [...currentOutbound.keys()]) if (!ids.includes(id)) closeOutbound(id, false);
          for (const id of [...currentInbound.keys()]) if (!ids.includes(id)) closeInbound(id);
          if (local.current) for (const id of ids) void startOutbound(id, local.current);
        },
        onSignal: async (signal) => {
          if (signal.kind === "kick") {
            setKicked(true);
            stopSharing();
            for (const id of [...currentInbound.keys()]) closeInbound(id);
            signaling.current?.close();
            return;
          }
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
            const pc = existing?.pc ?? new RTCPeerConnection({ iceServers: iceServersRef.current });
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
    };
    void acquireRoomLock(room).then((lock) => {
      if (cancelled) { lock.release(); return; }
      releaseLock = lock.release;
      if (lock.acquired) connect(); else setDuplicateTab(true);
    });
    return () => {
      cancelled = true;
      releaseLock();
      clearSourceLost();
      signaling.current?.close();
      for (const link of currentOutbound.values()) { link.recovery?.close(); link.pc.close(); }
      for (const link of currentInbound.values()) link.pc.close();
      currentOutbound.clear(); currentInbound.clear();
      currentAdaptation.clear();
      local.current?.getTracks().forEach((track) => track.stop());
      local.current = null;
      optionsRef.current?.capture?.stop?.();
    };
  }, [room, closeInbound, closeOutbound, send, startOutbound, stopSharing, clearSourceLost]);

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
    // Background-tab timer throttling can leave a dead connection waiting
    // minutes for its next scheduled retry; resume immediately on return.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      for (const link of outbound.current.values()) link.recovery?.retryNow();
      void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [room]);

  const exportDiagnostics = useCallback(() => {
    const url = URL.createObjectURL(new Blob([report.current.serialize()], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "lumen-diagnostics.json"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const kickPeer = useCallback((id: string) => {
    if (!ownerRef.current) return;
    void send(id, self.current, "kick");
  }, [send]);

  const toggleRoomLock = useCallback((next: boolean) => {
    if (!ownerRef.current) return;
    signaling.current?.setLocked(next);
  }, []);

  return {
    runtime, exportDiagnostics, peers, remotes, localStream, sharing, settings, adaptiveQuality, settingsWarning, status, error, metrics,
    startSharing, stopSharing, setSettings, setAdaptiveQuality,
    owner, roomLocked, lockedOut, kicked, duplicateTab, kickPeer, toggleRoomLock,
  };
}
