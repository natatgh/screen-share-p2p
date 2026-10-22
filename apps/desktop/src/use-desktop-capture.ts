import { useEffect, useMemo, useRef, useState } from "react";
import type { RoomCapture } from "../../../src/lib/use-room";
import type { RuntimeMetrics } from "../../../src/lib/diagnostic-report";
import { captureConstraintsForSettings, type StreamSettings } from "../../../src/lib/stream-quality";
import workletUrl from "./pcm-worklet.js?url";
import type { CaptureSource } from "./types";

type AudioCapture = { context: AudioContext; unsubscribe: () => void };

/** Window/monitor capture with per-application audio, adapted to what the shared room view expects. */
export function useDesktopCapture(selected: CaptureSource | null, includeAudio: boolean) {
  const [audioWarning, setAudioWarning] = useState("");
  const audioStats = useRef({ audioBufferedMs: 0, audioDroppedFrames: 0, audioUnderruns: 0 });
  const audioNode = useRef<AudioWorkletNode | null>(null);
  const audioCapture = useRef<AudioCapture | null>(null);
  const sourceRef = useRef(selected);
  const audioRef = useRef(includeAudio);
  useEffect(() => { sourceRef.current = selected; }, [selected]);
  useEffect(() => { audioRef.current = includeAudio; }, [includeAudio]);
  useEffect(() => window.lumenDesktop.onAudioError(setAudioWarning), []);

  const capture = useMemo<RoomCapture>(() => ({
    start: async (settings: StreamSettings) => {
      if (!sourceRef.current) throw new Error("Selecione uma janela ou monitor.");
      setAudioWarning("");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: captureConstraintsForSettings(settings), audio: false,
      });
      if (audioRef.current) {
        let context: AudioContext | null = null;
        let unsubscribe: (() => void) | null = null;
        try {
          context = new AudioContext();
          await context.audioWorklet.addModule(workletUrl);
          const node = new AudioWorkletNode(context, "lumen-pcm", { outputChannelCount: [2] });
          audioNode.current = node;
          node.port.onmessage = ({ data }) => { audioStats.current = data; };
          const destination = context.createMediaStreamDestination();
          node.connect(destination);
          unsubscribe = window.lumenDesktop.onAudioChunk((chunk) => {
            node.port.postMessage(chunk.buffer, [chunk.buffer]);
          });
          await context.resume();
          const result = await window.lumenDesktop.startAppAudio();
          if (!result.ok) throw new Error(result.error || "Áudio indisponível.");
          stream.addTrack(destination.stream.getAudioTracks()[0]);
          audioCapture.current = { context, unsubscribe };
        } catch (cause) {
          audioNode.current = null;
          unsubscribe?.();
          if (context) void context.close();
          void window.lumenDesktop.stopAppAudio();
          setAudioWarning(cause instanceof Error ? cause.message : "Áudio indisponível; somente vídeo será transmitido.");
        }
      }
      void window.lumenDesktop.followSource();
      return stream;
    },
    onSourceChange: (listener) => window.lumenDesktop.onCaptureRetarget((sourceId) => listener(async () => {
      // Legacy desktop constraints: unlike getDisplayMedia they need no click, and this swap comes from the main process.
      const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: "desktop", chromeMediaSourceId: sourceId } } } as MediaStreamConstraints);
      return next.getVideoTracks()[0];
    })),
    stop: () => {
      void window.lumenDesktop.unfollowSource();
      audioCapture.current?.unsubscribe();
      void audioCapture.current?.context.close();
      audioCapture.current = null;
      audioNode.current = null;
      void window.lumenDesktop.stopAppAudio();
    },
  }), []);

  const runtimeMetrics = async (): Promise<RuntimeMetrics> => {
    audioNode.current?.port.postMessage({ type: "stats" });
    return { ...await window.lumenDesktop.getRuntimeMetrics(), ...(audioNode.current ? audioStats.current : {}) };
  };

  return { capture, runtimeMetrics, audioWarning };
}
