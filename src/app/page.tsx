"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, LockKeyhole, MonitorPlay, MousePointer2, Radio, Sparkles, UsersRound } from "lucide-react";
import { createRoom, isValidRoom, normalizeRoom } from "@/lib/room";

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
      <div className="brand"><span className="brand-mark"><MonitorPlay size={20} strokeWidth={2.5} /></span><span>Lumen<span className="brand-dot">.</span></span></div>
      <span className="header-note"><span className="status-dot" /> Compartilhe sem instalar nada</span>
    </header>

    <div className="home-grid">
      <section className="hero">
        <div className="hero-badge"><Sparkles size={14} /> UMA SALA PARA CADA IDEIA</div>
        <h1>Mostre sua tela.<br /><em>Aproxime as pessoas.</em></h1>
        <p>Compartilhe uma janela ou monitor em segundos. Abra uma sala, envie o link e deixe a conversa acontecer.</p>
        <div className="hero-points">
          <span><Radio size={17} /> Vídeo direto entre participantes</span>
          <span><UsersRound size={17} /> Sem cadastro</span>
          <span><MousePointer2 size={17} /> Um clique para começar</span>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-window"><div className="art-window-top"><i /><i /><i /><span>Uma ideia em movimento</span></div><div className="art-content"><div className="art-sidebar"><b /><b /><b /><b /></div><div className="art-canvas"><div className="art-glow"><MonitorPlay size={46} strokeWidth={1.3} /></div><div className="art-lines"><b /><b /><b /></div></div></div></div>
          <div className="art-live"><span className="live-dot" /> AO VIVO</div>
        </div>
      </section>

      <section className="entry-card" aria-label="Acessar sala">
        <div className="card-icon"><MonitorPlay size={24} /></div>
        <h2>Comece a compartilhar</h2>
        <p>Crie uma sala temporária e convide quem vai assistir ou apresentar com você.</p>
        <button className="primary-button create-button" onClick={() => router.push(`/room/${createRoom()}`)}>Criar nova sala <ArrowRight size={19} /></button>
        <div className="divider"><span>ou entre em uma sala</span></div>
        <label htmlFor="room-code">CÓDIGO DA SALA</label>
        <div className="join-row"><input id="room-code" value={code} onChange={(event) => { setCode(normalizeRoom(event.target.value)); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") join(); }} placeholder="XXXXXXXX" maxLength={8} autoComplete="off" aria-describedby={error ? "room-error" : undefined} /><button onClick={join} aria-label="Entrar na sala"><ArrowRight size={20} /></button></div>
        {error && <p id="room-error" className="error" role="alert">{error}</p>}
        <div className="card-footnote"><LockKeyhole size={16} /><span>O código é o convite. Compartilhe com pessoas de confiança.</span></div>
      </section>
    </div>

    <footer><span>© Lumen</span><span>Salas temporárias, sem gravação</span></footer>
  </main>;
}
