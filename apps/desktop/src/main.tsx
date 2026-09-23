import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, Copy, Maximize2, MonitorPlay, Radio, RefreshCw, ScreenShare, Settings2, Square, Users, Volume2, VolumeX, X } from "lucide-react";
import { createRoom, isValidRoom, normalizeRoom } from "../../../src/lib/room";
import { useRoom, type RoomCapture } from "../../../src/lib/use-room";
import { ConnectionDiagnostics } from "../../../src/components/connection-diagnostics";
import { captureConstraintsForSettings, type StreamFrameRate, type StreamMode, type StreamResolution, type StreamSettings } from "../../../src/lib/stream-quality";
import type { CaptureSource } from "./types";
import workletUrl from "./pcm-worklet.js?url";
import "./style.css";

function useSources() {
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [selected, setSelected] = useState<CaptureSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => {
    setLoading(true);
    try {
      const list = await window.lumenDesktop.listSources();
      setSources(list);
      setSelected((current) => list.find((source) => source.id === current?.id) || null);
      setError("");
    } catch { setError("Não foi possível listar as janelas."); }
    finally { setLoading(false); }
  };
  const select = async (source: CaptureSource) => {
    await window.lumenDesktop.selectSource(source.id);
    setSelected(source);
  };
  return { sources, selected, loading, error, refresh, select };
}

function Preview({ stream, source }: { stream: MediaStream | null; source: CaptureSource | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    return () => { video.srcObject = null; };
  }, [stream]);
  return stream
    ? <video className="preview-video" ref={ref} autoPlay playsInline muted aria-label="Prévia da transmissão" />
    : source ? <div className="preview-thumbnail"><img src={source.thumbnail} alt={`Prévia de ${source.name}`} /><span>{source.name} · prévia estática</span></div>
      : <div className="preview-empty"><MonitorPlay size={42} strokeWidth={1.3} /><strong>Prévia da sua transmissão</strong><span>Escolha uma fonte e clique em Entrar ao vivo.</span></div>;
}

function VideoTile({ stream, label, own = false }: { stream: MediaStream; label: string; own?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playBlocked, setPlayBlocked] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().then(() => setPlayBlocked(false)).catch(() => setPlayBlocked(true));
    return () => { video.srcObject = null; };
  }, [stream]);
  return <div className="video-tile"><video ref={ref} autoPlay playsInline muted={own} aria-label={`Transmissão de ${label}`} />
    <div className="tile-controls"><span><Radio size={13} /> {label}{own ? " · Você" : ""}</span><button title="Tela cheia" aria-label={`Tela cheia: ${label}`} onClick={() => void ref.current?.requestFullscreen()}><Maximize2 size={16} /></button></div>
    {playBlocked && <button className="play-overlay" onClick={() => void ref.current?.play().then(() => setPlayBlocked(false))}>Clique para assistir com áudio</button>}
  </div>;
}

function Session({ code, leave }: { code: string; leave: () => void }) {
  const { sources, selected, loading, error: sourceError, refresh, select } = useSources();
  const [includeAudio, setIncludeAudio] = useState(true);
  const [audioWarning, setAudioWarning] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");
  const [copied, setCopied] = useState(false);
  const [version, setVersion] = useState("");
  const captureRef = useRef<{ context: AudioContext; unsubscribe: () => void } | null>(null);
  const sourceRef = useRef(selected);
  const audioRef = useRef(includeAudio);
  useEffect(() => { sourceRef.current = selected; }, [selected]);
  useEffect(() => { audioRef.current = includeAudio; }, [includeAudio]);

  useEffect(() => {
    void window.lumenDesktop.getVersion().then(setVersion);
    const offError = window.lumenDesktop.onAudioError(setAudioWarning);
    const offUpdate = window.lumenDesktop.onUpdate(setUpdateStatus);
    return () => { offError(); offUpdate(); };
  }, []);

  const capture = useMemo<RoomCapture>(() => ({
    start: async (settings: StreamSettings) => {
      if (!sourceRef.current) throw new Error("Selecione uma janela ou monitor.");
      setAudioWarning("");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: captureConstraintsForSettings(settings), audio: false,
      });
      if (sourceRef.current.type === "window" && audioRef.current) {
        let context: AudioContext | null = null;
        let unsubscribe: (() => void) | null = null;
        try {
          context = new AudioContext();
          await context.audioWorklet.addModule(workletUrl);
          const node = new AudioWorkletNode(context, "lumen-pcm", { outputChannelCount: [2] });
          const destination = context.createMediaStreamDestination();
          node.connect(destination);
          unsubscribe = window.lumenDesktop.onAudioChunk((chunk) => {
            const copy = new Uint8Array(chunk);
            node.port.postMessage(copy.buffer, [copy.buffer]);
          });
          await context.resume();
          const result = await window.lumenDesktop.startAppAudio();
          if (!result.ok) throw new Error(result.error || "Áudio indisponível.");
          stream.addTrack(destination.stream.getAudioTracks()[0]);
          captureRef.current = { context, unsubscribe };
        } catch (cause) {
          unsubscribe?.();
          if (context) void context.close();
          void window.lumenDesktop.stopAppAudio();
          setAudioWarning(cause instanceof Error ? cause.message : "Áudio indisponível; somente vídeo será transmitido.");
        }
      }
      return stream;
    },
    stop: () => {
      captureRef.current?.unsubscribe();
      void captureRef.current?.context.close();
      captureRef.current = null;
      void window.lumenDesktop.stopAppAudio();
    },
  }), []);

  const { peers, remotes, localStream, sharing, settings, adaptiveQuality, settingsWarning, status, error, metrics, startSharing, stopSharing, setSettings, setAdaptiveQuality } = useRoom(code, {
    capture,
    signaling: { url: __SUPABASE_URL__, key: __SUPABASE_KEY__, localHost: "localhost", production: import.meta.env.PROD },
  });
  const [starting, setStarting] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const start = async () => { setStarting(true); try { await startSharing(); setShareModal(false); } finally { setStarting(false); } };
  const pick = async (source: CaptureSource) => { if (sharing) stopSharing(); await select(source); };
  const invite = `https://screen-share-p2p.vercel.app/room/${code}`;
  const copy = async () => { await navigator.clipboard.writeText(invite); setCopied(true); setTimeout(() => setCopied(false), 2200); };

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-icon"><MonitorPlay size={21} /></span>Lumen<span className="mint">.</span><span className="desktop-label">DESKTOP</span></div><div className="topbar-right"><span className="room-code">Sala <b>{code}</b></span><span className={`connection ${status === "Conectado" ? "online" : ""}`}><span />{status}</span></div></header>
    <main className="content"><aside className="sidebar"><div className="sidebar-top"><span className="eyebrow">SUA SALA</span><h1>{code}</h1><p>Assista às transmissões ou compartilhe sua tela quando quiser.</p></div>
      <div className="sidebar-section"><div className="section-heading">CONVITE</div><div className="invite-box"><span>{code}</span><button onClick={() => void copy()} title="Copiar link da sala">{copied ? <Check size={17} /> : <Copy size={17} />}</button></div><small>{copied ? "Link copiado" : "Convide pessoas pelo link"}</small></div>
      <div className="sidebar-section"><div className="section-heading people-heading"><span><Users size={14} /> PARTICIPANTES</span><b>{peers.length + 1}</b></div><div className="person"><span className="avatar self">V</span><span><b>Você</b><small>{sharing ? "Transmitindo agora" : "Na sala"}</small></span>{sharing && <Radio size={14} />}</div>{peers.map((peer, index) => <div className="person" key={peer}><span className="avatar">{index + 1}</span><span><b>Participante {index + 1}</b><small>{remotes.some((remote) => remote.id === peer) ? "Transmitindo agora" : "Na sala"}</small></span>{remotes.some((remote) => remote.id === peer) && <Radio size={14} />}</div>)}</div>
      <div className="sidebar-bottom"><button onClick={() => { stopSharing(); leave(); }}>Sair da sala</button><span>v{version}</span></div></aside>
      <section className="workspace room-workspace"><div className="workspace-title"><div><span className="eyebrow">SALA DE TRANSMISSÃO</span><h2>{remotes.length + (sharing ? 1 : 0) ? "Transmissões ao vivo" : peers.length ? "Pessoas na sala" : "Tudo pronto para assistir"}</h2></div><span className="viewer-count"><Users size={16} /> {peers.length + 1} na sala</span></div><ConnectionDiagnostics status={status} peers={peers} metrics={metrics} adaptiveQuality={adaptiveQuality} onAdaptiveQualityChange={setAdaptiveQuality} />
        {remotes.length || (sharing && localStream) ? <div className="stream-grid">{remotes.map((remote) => <VideoTile key={remote.id} stream={remote.stream} label={`Participante ${Math.max(1, peers.indexOf(remote.id) + 1)}`} />)}{sharing && localStream && <VideoTile stream={localStream} label="Sua tela" own />}</div> : peers.length ? <div className="members-area"><div className="member-grid"><div className="member-tile"><span className="member-avatar self">V</span><strong>Você</strong><small>Assistindo</small></div>{peers.map((peer, index) => <div className="member-tile" key={peer}><span className="member-avatar">{index + 1}</span><strong>Participante {index + 1}</strong><small>Na sala</small></div>)}</div><div className="members-cta"><span>Nenhuma transmissão ao vivo ainda.</span><button className="go-live" onClick={() => { setShareModal(true); void refresh(); }}><ScreenShare size={17} /> Compartilhar tela</button></div></div> : <div className="room-empty"><div className="empty-icon"><MonitorPlay size={42} strokeWidth={1.5} /></div><h3>Nenhuma tela compartilhada ainda</h3><p>Você já está na sala. Aguarde uma transmissão ou comece a sua.</p><div><button className="go-live" onClick={() => { setShareModal(true); void refresh(); }}><ScreenShare size={17} /> Compartilhar tela</button><button className="secondary" onClick={() => void copy()}><Copy size={16} /> {copied ? "Copiado" : "Copiar convite"}</button></div></div>}
        {(error || audioWarning || settingsWarning) && <div className="warning" role="status">{error || audioWarning || settingsWarning}</div>}
        <footer className="actionbar room-actions"><div className="update"><span>{updateStatus || "Atualizações verificadas automaticamente."}</span><button onClick={() => void window.lumenDesktop.checkUpdate()}>Verificar</button><button onClick={() => void window.lumenDesktop.openReleases()}>Releases</button></div><div className="room-buttons">{sharing && <button className="stop" onClick={stopSharing}><Square size={15} fill="currentColor" /> Parar transmissão</button>}<button className="go-live" onClick={() => { setShareModal(true); void refresh(); }}><ScreenShare size={17} />{sharing ? "Alterar transmissão" : "Compartilhar tela"}</button></div></footer>
      </section></main>
    {shareModal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShareModal(false); }}><div className="share-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><span className="eyebrow">TRANSMISSÃO</span><h2 id="modal-title">Compartilhar tela</h2><p>Escolha uma janela ou monitor. Você pode continuar apenas assistindo.</p></div><button className="icon-button" title="Fechar" aria-label="Fechar" onClick={() => setShareModal(false)}><X size={20} /></button></div>
      <div className="modal-body"><div className="source-heading"><strong>Janelas e monitores</strong><button onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} /> Atualizar</button></div>{sourceError && <p className="warning" role="alert">{sourceError}</p>}<div className="sources">{sources.map((source) => <button key={source.id} className={`source ${selected?.id === source.id ? "selected" : ""}`} onClick={() => void pick(source)}><img src={source.thumbnail} alt="" /><span>{source.icon && <img src={source.icon} alt="" />}<b>{source.name}</b></span><small>{source.type === "window" ? "JANELA" : "MONITOR"}</small></button>)}</div>
        <div className="bottom-grid"><div className="preview"><div className="panel-heading"><MonitorPlay size={17} /> Prévia</div><Preview stream={localStream} source={selected} /></div><div className="settings"><div className="panel-heading"><Settings2 size={17} /> Configurações</div><label className="field">PREFERÊNCIA<select value={settings.mode} onChange={(e) => void setSettings({ ...settings, mode: e.target.value as StreamMode })}><option value="balanced">Equilibrado</option><option value="smooth">Vídeo mais fluido</option><option value="detail">Texto mais nítido</option></select></label><div className="field">RESOLUÇÃO<div className="segments">{([720, 1080, "source"] as StreamResolution[]).map((resolution) => <button key={resolution} className={settings.resolution === resolution ? "selected" : ""} onClick={() => void setSettings({ ...settings, resolution })}>{resolution === "source" ? "Original" : `${resolution}p`}</button>)}</div></div><div className="field">QUADROS POR SEGUNDO<div className="segments">{([15, 30, 60] as StreamFrameRate[]).map((frameRate) => <button key={frameRate} className={settings.frameRate === frameRate ? "selected" : ""} onClick={() => void setSettings({ ...settings, frameRate })}>{frameRate}</button>)}</div></div><label className="audio-toggle"><span>{includeAudio ? <Volume2 size={18} /> : <VolumeX size={18} />}<span><b>Áudio do aplicativo</b><small>{selected?.type === "window" ? "Pode incluir outras janelas do mesmo aplicativo." : "Monitores transmitem somente vídeo."}</small></span></span><input type="checkbox" checked={includeAudio} disabled={sharing || selected?.type !== "window"} onChange={(e) => setIncludeAudio(e.target.checked)} /></label></div></div></div>
      <div className="modal-footer"><button className="secondary" onClick={() => setShareModal(false)}>Cancelar</button><button className="go-live" onClick={() => void start()} disabled={!selected || starting || sharing}><ScreenShare size={17} />{starting ? "Iniciando…" : sharing ? "Pare a transmissão para trocar" : "Entrar ao vivo"}</button></div></div></div>}
  </div>;
}

function App() {
  const [input, setInput] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  if (code) return <Session code={code} leave={() => setCode(null)} />;
  const join = () => { const normalized = normalizeRoom(input); if (isValidRoom(normalized)) setCode(normalized); else setMessage("Digite um código de sala com oito caracteres."); };
  return <div className="entry"><div className="entry-card"><span className="brand-icon"><MonitorPlay size={24} /></span><span className="eyebrow">LUMEN DESKTOP</span><h1>Entre e fique à vontade.</h1><p>Assista às transmissões da sala ou compartilhe uma janela ou monitor quando quiser.</p><button className="go-live" onClick={() => setCode(createRoom())}>Criar sala</button><div className="entry-divider">ou entre numa sala</div><div className="join"><input value={input} maxLength={8} onChange={(e) => setInput(normalizeRoom(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") join(); }} placeholder="CÓDIGO DA SALA" aria-label="Código da sala" /><button onClick={join}>Entrar</button></div>{message && <small className="warning">{message}</small>}</div></div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
