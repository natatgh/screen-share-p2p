"use client";

import { useState } from "react";
import { Activity, ChevronDown } from "lucide-react";
import type { MediaHealth, PeerMetrics } from "../lib/rtc-stats";
import styles from "./connection-diagnostics.module.css";

const healthText: Record<MediaHealth, string> = {
  connecting: "Conectando",
  good: "Estável",
  degraded: "Atenção",
  poor: "Instável",
};

function value(number: number | null, suffix: string, digits = 0): string {
  return number === null ? "—" : `${number.toFixed(digits)} ${suffix}`;
}

export function ConnectionDiagnostics({ status, peers, metrics }: {
  status: string;
  peers: string[];
  metrics: PeerMetrics[];
}) {
  const [open, setOpen] = useState(false);
  const worst = metrics.some((item) => item.health === "poor") ? "poor"
    : metrics.some((item) => item.health === "degraded") ? "degraded"
      : metrics.some((item) => item.health === "good") ? "good" : "connecting";
  const totalSend = metrics.filter((item) => item.direction === "send").reduce((sum, item) => sum + (item.bitrateKbps ?? 0), 0);
  const totalReceive = metrics.filter((item) => item.direction === "receive").reduce((sum, item) => sum + (item.bitrateKbps ?? 0), 0);

  return <section className={styles.card} aria-label="Diagnóstico da conexão">
    <button className={styles.toggle} type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className={styles.title}><Activity size={17} /><strong>Diagnóstico</strong><span className={`${styles.dot} ${styles[worst]}`} />{metrics.length ? healthText[worst] : "Aguardando mídia"}</span>
      <span className={styles.summary}>{metrics.length ? `↑ ${Math.round(totalSend)} kb/s  ↓ ${Math.round(totalReceive)} kb/s` : status}<ChevronDown size={16} className={open ? styles.rotated : ""} /></span>
    </button>
    {open && <div className={styles.body}>
      <div className={styles.signaling}><span>Sinalização da sala</span><strong>{status}</strong></div>
      {metrics.length ? <div className={styles.list}>{metrics.map((item) => {
        const index = peers.indexOf(item.id);
        return <div className={styles.peer} key={`${item.direction}:${item.id}`}>
          <div className={styles.peerHeading}><strong>{item.direction === "send" ? "Enviando para" : "Recebendo de"} participante {index >= 0 ? index + 1 : "—"}</strong><span className={`${styles.health} ${styles[item.health]}`}>{healthText[item.health]}</span></div>
          <div className={styles.values}>
            <div><span>Banda {item.direction === "send" ? "envio" : "recebimento"}</span><strong>{value(item.bitrateKbps, "kb/s")}</strong></div>
            <div><span>RTT P2P</span><strong>{value(item.rttMs, "ms")}</strong></div>
            <div><span>Jitter</span><strong>{value(item.jitterMs, "ms")}</strong></div>
            <div><span>Vídeo</span><strong>{item.width && item.height ? `${item.width}×${item.height}` : "—"}{item.fps !== null ? ` · ${item.fps} FPS` : ""}</strong></div>
            <div><span>Perda de pacotes</span><strong>{value(item.lossPercent, "%", 1)}</strong></div>
            {item.direction === "receive" && <><div><span>Quadros descartados (2 s)</span><strong>{item.recentDroppedFrames ?? "—"}</strong></div><div><span>Congelamentos (2 s)</span><strong>{item.recentFreezes ?? "—"}</strong></div></>}
          </div>
        </div>;
      })}</div> : <p className={styles.empty}>Sem transmissão P2P ativa. As métricas aparecem quando alguém compartilha e outra pessoa assiste.</p>}
      <p className={styles.note}>Banda e perda usam amostras de cerca de 2 segundos. RTT mede a conexão entre participantes; quadros descartados e congelamentos dependem dos dados fornecidos pelo navegador.</p>
    </div>}
  </section>;
}
