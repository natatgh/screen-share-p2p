import { useEffect, useState } from "react";
import { ChevronDown, ExternalLink, RefreshCw } from "lucide-react";
import lumenIconUrl from "../assets/lumen-icon.png";

type UpdateKind = "uptodate" | "checking" | "progress" | "ready" | "error";

function updateKind(status: string): UpdateKind {
  if (!status) return "uptodate";
  if (/pronta|disponível/i.test(status)) return "ready";
  if (/baixando|procurando/i.test(status)) return "progress";
  if (/indisponível|falha|erro/i.test(status)) return "error";
  return "uptodate";
}

export function useUpdateInfo() {
  const [version, setVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");
  useEffect(() => {
    void window.lumenDesktop.getVersion().then(setVersion);
    return window.lumenDesktop.onUpdate(setUpdateStatus);
  }, []);
  return { version, updateStatus };
}

export function UpdateMenu({ version, status }: { version: string; status: string }) {
  const [open, setOpen] = useState(false);
  const kind = updateKind(status);
  const label = kind === "ready" ? "Atualização pronta" : kind === "progress" ? status || "Verificando…" : `v${version}`;
  return <div className="update-menu">
    <button type="button" className={`update-chip ${kind}`} aria-expanded={open} aria-controls="update-popover" onClick={() => setOpen((current) => !current)}>
      <span className="update-dot" />{label}<ChevronDown size={13} className={open ? "rotated" : ""} />
    </button>
    {open && <section id="update-popover" className="update-popover" aria-label="Versão e atualizações" role="dialog">
      <div className="update-popover-head"><img src={lumenIconUrl} alt="" /><div><strong>Lumen Desktop</strong><span>v{version}</span></div></div>
      <p className={`update-status ${kind}`}>{status || "Você está na versão mais recente."}</p>
      <div className="update-popover-actions">
        <button onClick={() => void window.lumenDesktop.checkUpdate()}><RefreshCw size={14} /> Verificar</button>
        <button onClick={() => void window.lumenDesktop.openReleases()}><ExternalLink size={14} /> Notas da versão</button>
      </div>
    </section>}
  </div>;
}
