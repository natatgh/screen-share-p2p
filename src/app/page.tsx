"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createRoom, isValidRoom, normalizeRoom } from "@/lib/room";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const join = () => {
    const normalized = normalizeRoom(code);
    if (!isValidRoom(normalized)) return setError("Digite um código válido de 8 caracteres.");
    router.push(`/room/${normalized}`);
  };
  return <main className="home-shell">
    <div className="brand"><span className="brand-mark">◈</span> Lumen<span className="brand-dot">.</span></div>
    <div className="home-grid">
      <section className="hero">
        <div className="eyebrow"><span className="live-dot" /> SCREEN SHARING, SEM COMPLICAÇÃO</div>
        <h1>Mostre sua tela.<br /><em>Compartilhe a ideia.</em></h1>
        <p>Crie uma sala temporária e convide quem você quiser. Qualquer pessoa pode transmitir uma janela, monitor ou tela inteira.</p>
        <div className="hero-points"><span>↗ Direto entre navegadores</span><span>◎ Sem conta</span><span>◇ Sem instalar nada</span></div>
      </section>
      <section className="entry-card" aria-label="Acessar sala">
        <div className="card-icon">▣</div><h2>Comece uma sessão</h2><p>Uma sala privada por código, pronta em segundos.</p>
        <button className="primary-button" onClick={() => router.push(`/room/${createRoom()}`)}>Criar nova sala <span>↗</span></button>
        <div className="divider"><span>ou entre com um código</span></div>
        <label htmlFor="room-code">CÓDIGO DA SALA</label>
        <div className="join-row"><input id="room-code" value={code} onChange={(event) => { setCode(normalizeRoom(event.target.value)); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter") join(); }} placeholder="XXXXXXXX" maxLength={8} autoComplete="off" /><button onClick={join} aria-label="Entrar na sala">→</button></div>
        {error && <p className="error" role="alert">{error}</p>}
        <small>O código funciona como convite. Compartilhe apenas com pessoas de confiança.</small>
      </section>
    </div>
    <footer>WebRTC P2P · Código temporário · Feito para conversas rápidas</footer>
  </main>;
}
