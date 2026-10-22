import { MonitorPlay } from "lucide-react";

/** The Lumen wordmark, shared by the website and the desktop app. Wrap it in whatever navigates home. */
export function Brand() {
  return <><span className="brand-mark"><MonitorPlay size={19} strokeWidth={2.5} /></span><span>Lumen<span className="brand-dot">.</span></span></>;
}
