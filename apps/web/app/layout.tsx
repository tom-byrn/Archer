import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "Archlang",
  description:
    "Architecture canvas that compiles to an agent-readable language — and back.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
