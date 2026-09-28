/** Only monitor capture may request system audio. Windows never fall back to it. */
export function audioSourceArgs(sourceId: string | undefined, lumenPid: number): string[] | null {
  const window = sourceId?.match(/^window:(\d+):[01]$/);
  if (window && window[1] !== "0") return [window[1]];
  if (sourceId?.match(/^screen:\d+:\d+$/) && Number.isSafeInteger(lumenPid) && lumenPid > 0) {
    return ["--system", String(lumenPid)];
  }
  return null;
}
