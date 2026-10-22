import { useEffect } from "react";
import { RefreshCw, ScreenShare, Volume2, VolumeX, X } from "lucide-react";
import type { CaptureSource } from "./types";

type SourcePickerProps = {
  sources: CaptureSource[];
  selected: CaptureSource | null;
  loading: boolean;
  error: string;
  includeAudio: boolean;
  onAudioChange: (enabled: boolean) => void;
  onSelect: (source: CaptureSource) => void;
  onRefresh: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Chooses the window or monitor to broadcast; the browser's own picker does this on the web. */
export function SourcePicker({ sources, selected, loading, error, includeAudio, onAudioChange, onSelect, onRefresh, onCancel, onConfirm }: SourcePickerProps) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);
  const audioLabel = selected?.type === "screen" ? "Áudio do sistema" : "Áudio do aplicativo";
  const audioNote = selected?.type === "window" ? "Pode incluir outras janelas do mesmo aplicativo." : "Som de todos os aplicativos, exceto o Lumen. Não se limita ao monitor escolhido.";
  return <div className="picker-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <div className="picker" role="dialog" aria-modal="true" aria-labelledby="picker-title">
      <div className="picker-header">
        <div><span className="eyebrow">TRANSMISSÃO</span><h2 id="picker-title">Compartilhar tela</h2><p>Escolha uma janela ou monitor. A qualidade fica no painel da sala.</p></div>
        <button className="icon-button" onClick={onCancel} aria-label="Fechar" title="Fechar"><X size={20} /></button>
      </div>
      <div className="picker-body">
        <div className="picker-sources-heading"><strong>Janelas e monitores</strong><button className="copy-chip" onClick={onRefresh} disabled={loading}><RefreshCw size={15} /> Atualizar</button></div>
        {error && <p className="quality-warning" role="alert">{error}</p>}
        <div className="source-grid">
          {sources.map((source) => <button key={source.id} className={`source-card ${selected?.id === source.id ? "selected" : ""}`} aria-pressed={selected?.id === source.id} onClick={() => onSelect(source)}>
            <img className="source-thumb" src={source.thumbnail} alt="" />
            <span className="source-name">{source.icon && <img src={source.icon} alt="" />}<b>{source.name}</b></span>
            <small>{source.type === "window" ? "JANELA" : "MONITOR"}</small>
          </button>)}
        </div>
        <label className="audio-toggle">
          <span className="audio-toggle-icon">{includeAudio ? <Volume2 size={19} /> : <VolumeX size={19} />}</span>
          <span><strong>{audioLabel}</strong><small>{audioNote}</small></span>
          <input type="checkbox" checked={includeAudio} disabled={!selected} onChange={(event) => onAudioChange(event.target.checked)} />
        </label>
      </div>
      <div className="picker-footer">
        <button className="empty-invite" onClick={onCancel}>Cancelar</button>
        <button className="primary-button" onClick={onConfirm} disabled={!selected}><ScreenShare size={18} /> Entrar ao vivo</button>
      </div>
    </div>
  </div>;
}
