"use client";

import { useRouter } from "next/navigation";
import { MonitorPlay, Radio, ScreenShare, UsersRound } from "lucide-react";
import { Brand } from "@/components/brand";
import { EntryCard } from "@/components/entry-card";
import { createRoom } from "@/lib/room";

export default function Home() {
  const router = useRouter();

  return <main className="home-shell">
    <header className="home-header">
      <span className="brand"><Brand /></span>
      <nav className="home-nav">
        <a href="#como-funciona">Como funciona</a>
        <a href="https://github.com/natatgh/screen-share-p2p/blob/master/PRIVACY.md" target="_blank" rel="noreferrer">Privacidade</a>
        <a className="download-link" href="https://github.com/natatgh/screen-share-p2p/releases" target="_blank" rel="noreferrer"><ScreenShare size={16} /> Lumen para Windows</a>
      </nav>
    </header>

    <div className="home-grid">
      <section className="hero">
        <div className="hero-badge"><span className="status-dot" style={{ background: "var(--accent)" }} /> COMPARTILHAMENTO DE TELA P2P</div>
        <h1>Mostre sua tela.<br /><em>Sem instalar nada.</em></h1>
        <p>Crie uma sala, envie o link e compartilhe uma janela ou monitor. Quem entrar pode assistir ou apresentar também.</p>
        <ul className="hero-points">
          <li><Radio size={17} /> Sem conta</li>
          <li><UsersRound size={17} /> Sem gravação</li>
          <li><MonitorPlay size={17} /> Vídeo direto entre navegadores</li>
        </ul>
      </section>

      <EntryCard onCreate={() => router.push(`/room/${createRoom()}`)} onJoin={(code) => router.push(`/room/${code}`)} />
    </div>

    <section id="como-funciona" className="how-it-works" aria-label="Como funciona">
      <div className="how-step"><span>01</span><div><strong>Crie a sala</strong><p>Um clique gera um código único e temporário.</p></div></div>
      <div className="how-step"><span>02</span><div><strong>Envie o link</strong><p>Quem receber entra direto pelo navegador ou pelo app.</p></div></div>
      <div className="how-step"><span>03</span><div><strong>Compartilhe ou assista</strong><p>Qualquer pessoa pode transmitir; várias telas ao mesmo tempo.</p></div></div>
    </section>

    <footer className="home-footer"><span>© Lumen</span><span>Salas temporárias, sem gravação</span></footer>
  </main>;
}
