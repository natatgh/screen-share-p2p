"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, LockKeyhole, MonitorPlay, Radio, ScreenShare, UsersRound } from "lucide-react";
import { createRoom, isValidRoom, normalizeRoom } from "@/lib/room";

function formatCode(value: string): string {
  return value.length > 4 ? `${value.slice(0, 4)} ${value.slice(4)}` : value;
}

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const join = () => {
    const normalized = normalizeRoom(code);
    if (!isValidRoom(normalized)) {
      setError("Digite um código válido de 8 caracteres.");
      return;
    }
    router.push(`/room/${normalized}`);
  };

  return <main className="home-shell">
    <header className="home-header">
      <span className="brand"><span className="brand-mark"><MonitorPlay size={19} strokeWidth={2.5} /></span><span>Lumen<span className="brand-dot">.</span></span></span>
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

      <section className="entry-card" aria-label="Acessar sala">
        <div>
          <h2>Comece agora</h2>
          <p>A sala existe enquanto houver alguém nela. Nada fica salvo.</p>
        </div>
        <button className="primary-button" onClick={() => router.push(`/room/${createRoom()}`)}>Criar sala <ArrowRight size={19} /></button>
        <div className="divider">ou entre com um código</div>
        <div className="join-row">
          <label htmlFor="room-code">Código da sala</label>
          <div className="join-row-inputs">
            <input id="room-code" value={formatCode(code)} onChange={(event) => { setCode(normalizeRoom(event.target.value)); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") join(); }} placeholder="XXXX XXXX" maxLength={9} autoComplete="off" aria-describedby={error ? "room-error" : undefined} />
            <button onClick={join} aria-label="Entrar na sala"><ArrowRight size={20} /></button>
          </div>
          {error && <p id="room-error" className="error" role="alert">{error}</p>}
        </div>
        <div className="card-footnote"><LockKeyhole size={16} /><span>O código é o convite: quem tiver o link entra. Envie só para pessoas de confiança.</span></div>
      </section>
    </div>

    <section id="como-funciona" className="how-it-works" aria-label="Como funciona">
      <div className="how-step"><span>01</span><div><strong>Crie a sala</strong><p>Um clique gera um código único e temporário.</p></div></div>
      <div className="how-step"><span>02</span><div><strong>Envie o link</strong><p>Quem receber entra direto pelo navegador ou pelo app.</p></div></div>
      <div className="how-step"><span>03</span><div><strong>Compartilhe ou assista</strong><p>Qualquer pessoa pode transmitir; várias telas ao mesmo tempo.</p></div></div>
    </section>

    <footer className="home-footer"><span>© Lumen</span><span>Salas temporárias, sem gravação</span></footer>
  </main>;
}
