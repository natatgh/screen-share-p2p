"use client";

import Link from "next/link";
import { RoomView, type HomeLink } from "@/components/room-view";

const homeLink: HomeLink = ({ className, ariaLabel, children }) => <Link className={className} href="/" aria-label={ariaLabel}>{children}</Link>;

export default function RoomClient({ code }: { code: string }) {
  return <RoomView code={code} homeLink={homeLink} />;
}
