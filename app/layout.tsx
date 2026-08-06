import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Danilo Modesto Personal",
  description: "Gestão rápida de alunos, treinos, sessões e avaliações",
  manifest: "/manifest.webmanifest",
  themeColor: "#20242a"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
