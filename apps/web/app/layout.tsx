import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"], display: "swap" });
const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Archer",
  description:
    "Architecture canvas that compiles to an agent-readable language (Archer) — and back.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${instrument.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
