import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });
export const metadata: Metadata = { title: "Lumen — Compartilhe sua tela", description: "Salas temporárias para compartilhar tela diretamente entre navegadores." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body className={geist.className}>{children}</body></html>;
}
