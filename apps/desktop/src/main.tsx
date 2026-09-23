import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Check, Copy, MonitorPlay, Radio, RefreshCw, ScreenShare, Settings2, Square, Volume2, VolumeX, X } from "lucide-react";
import { createRoom, isValidRoom, normalizeRoom } from "../../../src/lib/room";
import { useRoom, type RoomCapture } from "../../../src/lib/use-room";
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
  useEffect(() => {
    void window.lumenDesktop.listSources().then(setSources).catch(() => setError("Não foi possível listar as janelas."));
  }, []);
  const select = async (source: CaptureSource) => {
    await window.lumenDesktop.selectSource(source.id);
    setSelected(source);
  };
  return { sources, selected, loading, error, refresh, select };
}

function Preview({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream;
    return () => { if (ref.current) ref.current.srcObject = null; };
  }, [stream]);
  return stream
    ? <video className="preview-video" ref={ref} autoPlay playsInline muted aria-label="Prévia da transmissão" />
    : <div className="preview-empty"><MonitorPlay size={42} strokeWidth={1.3} /><strong>Prévia da sua transmissão</strong><span>Escolha uma fonte e clique em Entrar ao vivo.</span></div>;
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

  const { peers, localStream, sharing, settings, settingsWarning, status, error, startSharing, stopSharing, setSettings } = useRoom(code, {
    capture,
    signaling: { url: __SUPABASE_URL__, key: __SUPABASE_KEY__, localHost: "localhost", production: import.meta.env.PROD },
  });
  const [starting, setStarting] = useState(false);
  const start = async () => { setStarting(true); try { await startSharing(); } finally { setStarting(false); } };
  const pick = async (source: CaptureSource) => { if (sharing) stopSharing(); await select(source); };
  const invite = `https://screen-share-p2p.vercel.app/room/${code}`;
  const copy = async () => { await navigator.clipboard.writeText(invite); setCopied(true); setTimeout(() => setCopied(false), 2200); };

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-icon"><MonitorPlay size={21} /></span>Lumen<span className="mint">.</span><span className="desktop-label">DESKTOP</span></div><div className="topbar-right"><span className="room-code">Sala <b>{code}</b></span><span className={`connection ${status === "Conectado" ? "online" : ""}`}><span />{status}</span></div></header>
    <main className="content"><aside className="sidebar"><div className="sidebar-top"><span className="eyebrow">TRANSMISSÃO</span><h1>Compartilhe sua tela</h1><p>Escolha uma janela ou monitor e convide outras pessoas para assistir no navegador.</p></div>
      <div className="sidebar-section"><div className="section-heading">SALA</div><div className="invite-box"><span>{code}</span><button onClick={() => void copy()} title="Copiar link da sala">{copied ? <Check size={17} /> : <Copy size={17} />}</button></div><small>{peers.length + 1} {peers.length ? "pessoas na sala" : "pessoa na sala"}</small></div>
      <div className="sidebar-bottom"><button onClick={() => { stopSharing(); leave(); }}>Sair da sala</button><span>v{version}</span></div></aside>
      <section className="workspace"><div className="workspace-title"><div><span className="eyebrow">O QUE VOCÊ VAI TRANSMITIR</span><h2>{selected?.name || "Escolha uma fonte"}</h2></div><span className={`live-pill ${sharing ? "active" : ""}`}><Radio size={14} />{sharing ? "AO VIVO" : "PRONTO"}</span></div>
        <div className="source-heading"><strong>Janelas e monitores</strong><button onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} /> Atualizar</button></div>
        {sourceError && <p className="warning" role="alert">{sourceError}</p>}
        <div className="sources">{sources.map((source) => <button key={source.id} className={`source ${selected?.id === source.id ? "selected" : ""}`} onClick={() => void pick(source)}><img src={source.thumbnail} alt="" /><span>{source.icon && <img src={source.icon} alt="" />}<b>{source.name}</b></span><small>{source.type === "window" ? "JANELA" : "MONITOR"}</small></button>)}</div>
        <div className="bottom-grid"><div className="preview"><div className="panel-heading"><MonitorPlay size={17} /> Prévia</div><Preview stream={localStream} /></div>
          <div className="settings"><div className="panel-heading"><Settings2 size={17} /> Configurações</div><label className="field">PREFERÊNCIA<select value={settings.mode} onChange={(e) => void setSettings({ ...settings, mode: e.target.value as StreamMode })}><option value="balanced">Equilibrado</option><option value="smooth">Vídeo mais fluido</option><option value="detail">Texto mais nítido</option></select></label>
            <div className="field">RESOLUÇÃO<div className="segments">{([720, 1080, "source"] as StreamResolution[]).map((resolution) => <button key={resolution} className={settings.resolution === resolution ? "selected" : ""} onClick={() => void setSettings({ ...settings, resolution })}>{resolution === "source" ? "Original" : `${resolution}p`}</button>)}</div></div>
            <div className="field">QUADROS POR SEGUNDO<div className="segments">{([15, 30, 60] as StreamFrameRate[]).map((frameRate) => <button key={frameRate} className={settings.frameRate === frameRate ? "selected" : ""} onClick={() => void setSettings({ ...settings, frameRate })}>{frameRate}</button>)}</div></div>
            <label className="audio-toggle"><span>{includeAudio ? <Volume2 size={18} /> : <VolumeX size={18} />}<span><b>Áudio do aplicativo</b><small>{selected?.type === "window" ? "Pode incluir outras janelas do mesmo aplicativo." : "Monitores transmitem somente vídeo."}</small></span></span><input type="checkbox" checked={includeAudio} disabled={sharing || selected?.type !== "window"} onChange={(e) => setIncludeAudio(e.target.checked)} /></label>
          </div></div>
        {(error || audioWarning || settingsWarning) && <div className="warning" role="status">{error || audioWarning || settingsWarning}</div>}
        <footer className="actionbar"><div className="update"><span>{updateStatus || "Atualizações verificadas automaticamente."}</span><button onClick={() => void window.lumenDesktop.checkUpdate()}>Verificar</button><button onClick={() => void window.lumenDesktop.openReleases()}>Releases</button></div><button className={sharing ? "stop" : "go-live"} onClick={sharing ? stopSharing : () => void start()} disabled={!sharing && (!selected || starting)}>{sharing ? <Square size={16} fill="currentColor" /> : <ScreenShare size={17} />}{sharing ? "Parar transmissão" : starting ? "Iniciando…" : "Entrar ao vivo"}</button></footer>
      </section></main></div>;
}

function App() {
  const [input, setInput] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  if (code) return <Session code={code} leave={() => setCode(null)} />;
  const join = () => { const normalized = normalizeRoom(input); if (isValidRoom(normalized)) setCode(normalized); else setMessage("Digite um código de sala com oito caracteres."); };
  return <div className="entry"><div className="entry-card"><span className="brand-icon"><MonitorPlay size={24} /></span><span className="eyebrow">LUMEN DESKTOP</span><h1>Transmita com mais controle.</h1><p>Compartilhe uma janela com áudio do aplicativo ou transmita um monitor sem enviar o som de todo o PC.</p><button className="go-live" onClick={() => setCode(createRoom())}>Criar sala</button><div className="entry-divider">ou entre numa sala</div><div className="join"><input value={input} maxLength={8} onChange={(e) => setInput(normalizeRoom(e.target.value))} onKeyDown={(e) => { if (e.key === "Enter") join(); }} placeholder="CÓDIGO DA SALA" aria-label="Código da sala" /><button onClick={join}>Entrar</button></div>{message && <small className="warning">{message}</small>}</div></div>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
