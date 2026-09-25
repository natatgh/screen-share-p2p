"use client";

import { ShieldCheck } from "lucide-react";
import type { MediaHealth, PeerMetrics } from "../lib/rtc-stats";
import styles from "./connection-diagnostics.module.css";

const healthText: Record<MediaHealth, string> = {
  connecting: "Conectando",
  good: "Estável",
  degraded: "Atenção",
  poor: "Instável",
};

const limitationText: Record<string, string> = { cpu: "CPU", bandwidth: "Banda", other: "Outra", none: "Nenhuma" };

function value(number: number | null, suffix: string, digits = 0): string {
  return number === null ? "—" : `${number.toFixed(digits)} ${suffix}`;
}

function tip(item: PeerMetrics): string {
  if (item.health === "poor" && item.direction === "send") return "Limitado pela conexão com esta pessoa. A qualidade automática pode reduzir só para ela.";
  if (item.health === "degraded" && item.qualityLimitationReason === "bandwidth") return "Limitado pela banda disponível. A imagem pode variar de nitidez.";
  if (item.health === "poor" && item.direction === "receive") return "A conexão com quem está transmitindo está instável no momento.";
  return "";
}

export function ConnectionDiagnostics({ status, peers, metrics, adaptiveQuality, onAdaptiveQualityChange }: {
  status: string;
  peers: string[];
  metrics: PeerMetrics[];
  adaptiveQuality?: boolean;
  onAdaptiveQualityChange?: (enabled: boolean) => void;
}) {
  const worst = metrics.some((item) => item.health === "poor") ? "poor"
    : metrics.some((item) => item.health === "degraded") ? "degraded"
      : metrics.some((item) => item.health === "good") ? "good" : "connecting";
  const totalSend = metrics.filter((item) => item.direction === "send").reduce((sum, item) => sum + (item.bitrateKbps ?? 0), 0);
  const totalReceive = metrics.filter((item) => item.direction === "receive").reduce((sum, item) => sum + (item.bitrateKbps ?? 0), 0);

  return <div className={styles.card}>
    <div className={`${styles.summary} ${styles[worst]}`}>
      <span className={styles.summaryIcon}><ShieldCheck size={20} /></span>
      <div>
        <strong>{metrics.length ? healthText[worst] === "Estável" ? "Tudo estável" : healthText[worst] : "Aguardando mídia"}</strong>
        <span>{metrics.length ? `↑ ${Math.round(totalSend)} kb/s · ↓ ${Math.round(totalReceive)} kb/s` : status}</span>
      </div>
    </div>

    {onAdaptiveQualityChange && <label className={styles.adaptive}>
      <span><span>Qualidade automática</span><small>Reduz para quem estiver com rede ruim; a escolha manual é o máximo.</small></span>
      <input type="checkbox" checked={adaptiveQuality ?? false} onChange={(event) => onAdaptiveQualityChange(event.target.checked)} />
    </label>}

    {metrics.length ? <div className={styles.list}>{metrics.map((item) => {
      const index = peers.indexOf(item.id);
      const note = tip(item);
      return <div className={styles.peer} key={`${item.direction}:${item.id}`}>
        <div className={styles.peerHeading}>
          <strong>{item.direction === "send" ? "Enviando para" : "Recebendo de"} participante {index >= 0 ? index + 1 : "—"}</strong>
          <span className={`${styles.health} ${styles[item.health]}`}><span className={styles.healthDot} />{healthText[item.health]}</span>
        </div>
        <div className={styles.values}>
          <div><span>Banda</span><strong>{value(item.bitrateKbps, "kb/s")}</strong></div>
          <div><span>Atraso</span><strong>{value(item.rttMs, "ms")}</strong></div>
          <div><span>Vídeo</span><strong>{item.width && item.height ? `${item.width}×${item.height}` : "—"}{item.fps !== null ? ` · ${item.fps} FPS` : ""}</strong></div>
        </div>
        {note && <p className={styles.tip}>{note}</p>}
        <details className={styles.details}>
          <summary>Ver detalhes técnicos</summary>
          <div className={styles.values}>
            <div><span>Jitter</span><strong>{value(item.jitterMs, "ms")}</strong></div>
            {item.codec && <div><span>Codec</span><strong>{item.codec}</strong></div>}
            {item.direction === "send" && <><div><span>Captura</span><strong>{value(item.captureFps, "FPS")}</strong></div><div><span>Codificação</span><strong>{value(item.encodedFps, "FPS")}{item.processingMs !== null ? ` · ${value(item.processingMs, "ms/quadro", 1)}` : ""}</strong></div><div><span>Limitação</span><strong>{limitationText[item.qualityLimitationReason ?? ""] ?? "—"}</strong></div></>}
            {item.direction === "receive" && <><div><span>Exibição</span><strong>{value(item.renderedFps, "FPS")}</strong></div><div><span>Decodificação</span><strong>{value(item.processingMs, "ms/quadro", 1)}</strong></div></>}
            <div><span>Perda de pacotes</span><strong>{value(item.lossPercent, "%", 1)}</strong></div>
            {item.direction === "receive" && <><div><span>Quadros descartados (2 s)</span><strong>{item.recentDroppedFrames ?? "—"}</strong></div><div><span>Congelamentos (2 s)</span><strong>{item.recentFreezes ?? "—"}</strong></div></>}
          </div>
        </details>
      </div>;
    })}</div> : <p className={styles.empty}>Sem transmissão P2P ativa. As métricas aparecem quando alguém compartilha e outra pessoa assiste.</p>}
    <p className={styles.note}>Sinalização da sala: {status}. RTT mede a conexão entre participantes; quadros descartados e congelamentos dependem dos dados do navegador.</p>
  </div>;
}
