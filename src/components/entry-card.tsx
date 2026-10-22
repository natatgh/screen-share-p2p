"use client";

import { useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { isValidRoom, normalizeRoom } from "../lib/room";

function formatCode(value: string): string {
  return value.length > 4 ? `${value.slice(0, 4)} ${value.slice(4)}` : value;
}

/** Create-or-join card shared by the website home and the desktop entry screen. */
export function EntryCard({ onCreate, onJoin }: { onCreate: () => void; onJoin: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const join = () => {
    const normalized = normalizeRoom(code);
    if (!isValidRoom(normalized)) {
      setError("Digite um código válido de 8 caracteres.");
      return;
    }
    onJoin(normalized);
  };

  return <section className="entry-card" aria-label="Acessar sala">
    <div>
      <h2>Comece agora</h2>
      <p>A sala existe enquanto houver alguém nela. Nada fica salvo.</p>
    </div>
    <button className="primary-button" onClick={onCreate}>Criar sala <ArrowRight size={19} /></button>
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
  </section>;
}
