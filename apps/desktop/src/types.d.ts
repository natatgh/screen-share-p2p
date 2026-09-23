export type CaptureSource = { id: string; name: string; type: "window" | "screen"; thumbnail: string; icon: string | null };
export type DesktopBridge = {
  listSources(): Promise<CaptureSource[]>;
  selectSource(id: string): Promise<boolean>;
  startAppAudio(): Promise<{ ok: boolean; error?: string }>;
  stopAppAudio(): Promise<void>;
  onAudioChunk(callback: (data: Uint8Array) => void): () => void;
  onAudioError(callback: (message: string) => void): () => void;
  onUpdate(callback: (status: string) => void): () => void;
  checkUpdate(): Promise<void>;
  getVersion(): Promise<string>;
  openReleases(): Promise<void>;
};

declare global {
  interface Window { lumenDesktop: DesktopBridge }
  const __SUPABASE_URL__: string;
  const __SUPABASE_KEY__: string;
}
