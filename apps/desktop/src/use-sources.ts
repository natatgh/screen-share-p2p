import { useState } from "react";
import type { CaptureSource } from "./types";

export function useSources() {
  const [sources, setSources] = useState<CaptureSource[]>([]);
  const [selected, setSelected] = useState<CaptureSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const refresh = async () => {
    setLoading(true);
    try {
      const list = await window.lumenDesktop.listSources();
      setSources(list);
      setSelected((current) => list.find((source) => source.id === current?.id) || null);
      setError("");
    } catch { setError("Não foi possível listar as janelas."); }
    finally { setLoading(false); }
  };
  const select = async (source: CaptureSource) => {
    await window.lumenDesktop.selectSource(source.id);
    setSelected(source);
  };
  return { sources, selected, loading, error, refresh, select };
}
