"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Copy, Expand, Info, Link2, Maximize2, MicOff, MonitorPlay, Radio, ScreenShare, Square, UsersRound, Volume2, VolumeX } from "lucide-react";
import { useRoom } from "@/lib/use-room";
import type { StreamQuality } from "@/lib/stream-quality";

type Screen = { id: string; label: string; stream: MediaStream; local: boolean };

function VideoPlayer({ screen }: { screen: Screen }) {
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(screen.local);
  const [blocked, setBlocked] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const hasAudio = !screen.local && screen.stream.getAudioTracks().length > 0;

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = screen.stream;
    element.muted = screen.local;
    void element.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    return () => { element.srcObject = null; };
  }, [screen.stream, screen.local]);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const toggleFullscreen = async () => {
    try {
      setFullscreenError(false);
      if (document.fullscreenElement === frame.current) await document.exitFullscreen();
      else await frame.current?.requestFullscreen();
    } catch { setFullscreenError(true); }
  };

  const resume = () => {
    void video.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  };

  return <div ref={frame} className="player-frame">
    <video ref={video} autoPlay playsInline muted={muted} aria-label={screen.label} />
    {blocked && <button className="player-resume" onClick={resume}><MonitorPlay size={23} /> Clique para reproduzir</button>}
    <div className="player-topbar"><span className="live-badge"><span className="live-dot" /> AO VIVO</span><span className="player-top-note">{screen.local ? "Prévia da sua transmissão" : "Transmissão P2P"}</span></div>
    <div className="player-toolbar">
      <div className="player-identity"><span className="player-avatar"><MonitorPlay size={18} /></span><div><strong>{screen.label}</strong><small>{screen.local ? "Outras pessoas verão esta tela" : "Compartilhamento ao vivo"}</small></div></div>
      <div className="player-buttons">
        {hasAudio && <button className="icon-button" onClick={() => setMuted((current) => !current)} aria-label={muted ? "Ativar áudio" : "Silenciar áudio"} title={muted ? "Ativar áudio" : "Silenciar áudio"}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>}
        {screen.local && <span className="muted-note"><MicOff size={14} /> Prévia sem áudio</span>}
        <button className="icon-button" onClick={toggleFullscreen} aria-label={fullscreen ? "Sair da tela cheia" : "Ver em tela cheia"} title={fullscreen ? "Sair da tela cheia" : "Ver em tela cheia"}><Maximize2 size={19} /></button>
      </div>
    </div>
    {fullscreenError && <div className="player-message" role="alert">Tela cheia indisponível neste navegador.</div>}
  </div>;
}

function StreamThumb({ screen, selected, onSelect }: { screen: Screen; selected: boolean; onSelect: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = screen.stream;
    void element.play().catch(() => {});
    return () => { element.srcObject = null; };
  }, [screen.stream]);

  return <button className={`stream-thumb ${selected ? "selected" : ""}`} onClick={onSelect} aria-pressed={selected} aria-label={`Destacar ${screen.label}`}>
    <video ref={video} autoPlay playsInline muted aria-hidden="true" />
    <span><span className="live-dot" /> {screen.label}</span>
  </button>;
}

export default function RoomClient({ code }: { code: string }) {
  const { peers, remotes, localStream, sharing, quality, status, error, startSharing, stopSharing, setQuality } = useRoom(code);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [startingShare, setStartingShare] = useState(false);
  const streams: Screen[] = [
    ...remotes.map((remote) => ({ id: remote.id, label: `Tela do participante ${Math.max(1, peers.indexOf(remote.id) + 1)}`, stream: remote.stream, local: false })),
    ...(localStream ? [{ id: "self", label: "Sua tela", stream: localStream, local: true }] : []),
  ];
  const featured = streams.find((screen) => screen.id === selectedId) ?? streams[0];
  const connected = status === "Conectado";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setCopyError(false);
      window.setTimeout(() => setCopied(false), 2500);
    } catch { setCopyError(true); }
  };

  const beginSharing = async () => {
    setStartingShare(true);
    try { await startSharing(); }
    finally { setStartingShare(false); }
  };

  return <main className="room-shell">
    <header className="room-header">
      <div className="room-header-left"><Link className="back-link" href="/" aria-label="Voltar ao início"><ArrowLeft size={18} /></Link><Link className="brand" href="/"><span className="brand-mark"><MonitorPlay size={19} strokeWidth={2.5} /></span><span>Lumen<span className="brand-dot">.</span></span></Link><span className="header-divider" /><span className="header-room">Sala <strong>{code}</strong></span></div>
      <div className={`room-status ${connected ? "connected" : ""}`}><span className="status-dot" /> {status}</div>
    </header>

    <div className="room-main">
      <aside className="room-sidebar">
        <div className="sidebar-section"><span className="eyebrow">SUA SALA</span><h1>{code}</h1><p>Envie o link para convidar alguém a assistir ou compartilhar.</p><button className="copy-button" onClick={copy}>{copied ? <Check size={17} /> : <Link2 size={17} />}{copied ? "Link copiado" : "Copiar link da sala"}</button>{copyError && <small className="copy-error" role="alert">Não foi possível copiar o link.</small>}</div>
        <div className="sidebar-section participants-section"><div className="section-title"><span><UsersRound size={15} /> PARTICIPANTES</span><b>{peers.length + 1}</b></div><div className="participant"><span className="avatar self">V</span><div><strong>Você</strong><small>{sharing ? "Compartilhando tela" : "Na sala"}</small></div>{sharing && <span className="participant-live">AO VIVO</span>}</div>{peers.map((id, index) => <div className="participant" key={id}><span className="avatar">{index + 1}</span><div><strong>Participante {index + 1}</strong><small>{remotes.some((remote) => remote.id === id) ? "Compartilhando tela" : "Na sala"}</small></div>{remotes.some((remote) => remote.id === id) && <span className="participant-live">AO VIVO</span>}</div>)}</div>
        <div className="sidebar-bottom"><Info size={17} /><span>Sem gravação. A mídia passa diretamente entre os participantes quando a rede permite.</span></div>
      </aside>

      <section className="stage">
        <div className="stage-heading"><div><div className="eyebrow"><Radio size={14} /> ÁREA DE TRANSMISSÃO</div><h2>{featured ? "Acompanhe a transmissão" : "Pronto para começar"}</h2><p>{featured ? "Selecione uma tela para destacar ou abra em tela cheia." : "Compartilhe sua tela ou convide alguém para apresentar."}</p></div><div className="viewer-count"><UsersRound size={16} /> {peers.length + 1} {peers.length ? "na sala" : "pessoa na sala"}</div></div>
        {error && <div className="stage-error" role="alert"><Info size={18} /> {error}</div>}

        {featured ? <div className="player-layout"><VideoPlayer key={featured.id} screen={featured} />{streams.length > 1 && <div className="stream-rail" aria-label="Outras transmissões"><div className="rail-heading">Telas na sala <span>{streams.length}</span></div><div className="stream-thumbs">{streams.map((screen) => <StreamThumb key={screen.id} screen={screen} selected={screen.id === featured.id} onSelect={() => setSelectedId(screen.id)} />)}</div></div>}</div> : <div className="empty-stage"><div className="empty-visual"><MonitorPlay size={42} strokeWidth={1.4} /><span><Expand size={16} /></span></div><h3>Nenhuma tela compartilhada</h3><p>Inicie uma transmissão ou copie o link para convidar alguém.</p><button className="empty-invite" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Link copiado" : "Copiar convite"}</button></div>}

        <div className="stage-actions"><div className="broadcast-message"><span className={`broadcast-icon ${sharing ? "active" : ""}`}>{sharing ? <Radio size={21} /> : <ScreenShare size={21} />}</span><div><strong>{sharing ? "Sua tela está ao vivo" : "Compartilhe sua tela"}</strong><span>{sharing ? peers.length ? "Os participantes podem assistir ao que você compartilhou." : "Convide alguém para assistir." : "Escolha uma janela, aba ou monitor no navegador."}</span></div></div><div className="stage-controls"><label className="quality-control">Qualidade <ChevronDown size={14} /><select value={quality} onChange={(event) => setQuality(event.target.value as StreamQuality)}><option value="high">Alta · original · até 6 Mb/s</option><option value="balanced">Equilibrada · 1080p · até 3 Mb/s</option><option value="dataSaver">Economia · 720p · até 1 Mb/s</option></select></label><button className={sharing ? "stop-button" : "primary-button"} onClick={sharing ? stopSharing : beginSharing} disabled={startingShare}>{sharing ? <Square size={16} fill="currentColor" /> : <ScreenShare size={18} />}{sharing ? "Parar transmissão" : startingShare ? "Abrindo captura…" : "Compartilhar tela"}</button></div></div>
      </section>
    </div>
  </main>;
}
