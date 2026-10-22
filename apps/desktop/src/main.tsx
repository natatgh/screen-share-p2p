import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/bricolage-grotesque/500.css";
import "@fontsource/bricolage-grotesque/700.css";
import "@fontsource/bricolage-grotesque/800.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import { createRoom } from "../../../src/lib/room";
import { Brand } from "../../../src/components/brand";
import { EntryCard } from "../../../src/components/entry-card";
import { RoomView, type HomeLink } from "../../../src/components/room-view";
import { SourcePicker } from "./source-picker";
import { UpdateMenu, useUpdateInfo } from "./update-menu";
import { useDesktopCapture } from "./use-desktop-capture";
import { useSources } from "./use-sources";
import "../../../src/app/globals.css";
import "./style.css";

const INVITE_BASE_URL = "https://screen-share-p2p.vercel.app/room";

function Session({ code, leave }: { code: string; leave: () => void }) {
  const { sources, selected, loading, error: sourceError, refresh, select } = useSources();
  const [includeAudio, setIncludeAudio] = useState(true);
  const { capture, runtimeMetrics, audioWarning } = useDesktopCapture(selected, includeAudio);
  const { version, updateStatus } = useUpdateInfo();
  const [settle, setSettle] = useState<((confirmed: boolean) => void) | null>(null);

  const pickSource = () => {
    void refresh();
    return new Promise<boolean>((resolve) => setSettle(() => resolve));
  };
  const finishPicking = (confirmed: boolean) => { settle?.(confirmed); setSettle(null); };

  const homeLink: HomeLink = ({ className, ariaLabel, children }) => <button type="button" className={className} aria-label={ariaLabel} onClick={leave}>{children}</button>;
  const describeBroadcast = (sharing: boolean) => {
    if (!sharing) return "Escolha uma janela ou monitor, com o áudio do aplicativo.";
    if (!includeAudio) return "Sem áudio compartilhado.";
    return selected?.type === "screen" ? "Áudio do sistema ativo." : "Áudio do aplicativo ativo.";
  };

  return <>
    <RoomView
      code={code}
      homeLink={homeLink}
      inviteUrl={`${INVITE_BASE_URL}/${code}`}
      headerExtra={<UpdateMenu version={version} status={updateStatus} />}
      options={{
        capture,
        runtimeMetrics,
        signaling: { url: __SUPABASE_URL__, key: __SUPABASE_KEY__, localHost: "localhost", production: import.meta.env.PROD },
        turnBaseUrl: __APP_URL__,
      }}
      pickSource={pickSource}
      notice={audioWarning}
      duplicateMessage="Esta sala já está aberta em outra janela do Lumen neste computador."
      describeBroadcast={describeBroadcast}
    />
    {settle && <SourcePicker sources={sources} selected={selected} loading={loading} error={sourceError} includeAudio={includeAudio}
      onAudioChange={setIncludeAudio} onSelect={(source) => void select(source)} onRefresh={() => void refresh()}
      onCancel={() => finishPicking(false)} onConfirm={() => finishPicking(true)} />}
  </>;
}

function Entry({ enter }: { enter: (code: string) => void }) {
  const { version, updateStatus } = useUpdateInfo();
  return <div className="desktop-entry">
    <header className="desktop-entry-header">
      <span className="brand"><Brand /></span>
      <UpdateMenu version={version} status={updateStatus} />
    </header>
    <main><EntryCard onCreate={() => enter(createRoom())} onJoin={enter} /></main>
  </div>;
}

function App() {
  const [code, setCode] = useState<string | null>(null);
  return code ? <Session code={code} leave={() => setCode(null)} /> : <Entry enter={setCode} />;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
