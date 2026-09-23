import { notFound } from "next/navigation";
import { isValidRoom } from "@/lib/room";
import RoomClient from "./room-client";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isValidRoom(code)) notFound();
  return <RoomClient code={code} />;
}
