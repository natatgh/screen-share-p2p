"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRoom } from "@/lib/use-room";

function VideoTile({ stream, label }: { stream: MediaStream; label: string }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (video.current) video.current.srcObject = stream; }, [stream]);
  return <div className="video-tile"><video ref={video} autoPlay playsInline controls aria-label={label} /><div className="video-label"><span className="live-dot" /> {label}</div></div>;
}

export default function RoomClient({ code }: { code: string }) {
  const { peers, remotes, sharing, status, error, startSharing, stopSharing } = useRoom(code);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  };
  return <main className="room-shell">
    <header className="room-header"><Link className="brand" href="/"><span className="brand-mark">◈</span> Lumen<span className="brand-dot">.</span></Link><span className="room-status"><span className="status-dot" /> {status}</span></header>
    <div className="room-main">
      <aside className="room-sidebar">
        <div className="sidebar-top"><div className="eyebrow">SALA TEMPORÁRIA</div><h1>{code}</h1><p>Convide alguém para assistir ou compartilhar a própria tela.</p></div>
        <button className="copy-button" onClick={copy}>{copied ? "✓ Link copiado" : "▢ Copiar link da sala"}</button>
        <div className="sidebar-separator" />
        <div className="section-label">PARTICIPANTES <span>{peers.length + 1}</span></div>
        <div className="participant"><span className="avatar self">V</span><div>Você<small>{sharing ? "Transmitindo agora" : "Na sala"}</small></div>{sharing && <span className="participant-live">AO VIVO</span>}</div>
        {peers.map((id, index) => <div className="participant" key={id}><span className="avatar">{index + 1}</span><div>Participante {index + 1}<small>{remotes.some((remote) => remote.id === id) ? "Transmitindo agora" : "Na sala"}</small></div></div>)}
        <div className="sidebar-bottom"><span>ⓘ</span> Salas não ficam gravadas. O vídeo passa diretamente entre os participantes sempre que a rede permitir.</div>
      </aside>
      <section className="stage">
        <div className="stage-heading"><div><div className="eyebrow">TRANSMISSÕES</div><h2>{remotes.length ? "Compartilhamentos ao vivo" : "Tudo pronto para começar"}</h2></div><span className="viewer-count">◎ {peers.length + 1} na sala</span></div>
        {error && <div className="stage-error" role="alert">{error}</div>}
        {remotes.length ? <div className="video-grid">{remotes.map((remote, index) => <VideoTile key={remote.id} stream={remote.stream} label={`Tela do participante ${peers.indexOf(remote.id) + 1 || index + 1}`} />)}</div> : <div className="empty-stage"><div className="empty-visual"><span>▧</span><i>✦</i></div><h3>Nenhuma tela sendo compartilhada</h3><p>Inicie a transmissão ou compartilhe o link para alguém entrar na sala.</p></div>}
        <div className="stage-actions"><div><strong>{sharing ? "Sua tela está ao vivo" : "Sua tela, sua vez"}</strong><span>{sharing ? "Os participantes podem ver o que você compartilhou." : "Escolha uma janela, tela ou monitor no navegador."}</span></div><button className={sharing ? "stop-button" : "primary-button"} onClick={sharing ? stopSharing : startSharing}>{sharing ? "■ Parar transmissão" : "▣ Compartilhar tela"}</button></div>
      </section>
    </div>
  </main>;
}
