import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Archer",
  description:
    "Architecture canvas that compiles to an agent-readable language (Archlang) — and back.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
