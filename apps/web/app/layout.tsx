import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { LEDE } from "@/lib/landingCopy";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});
// One serif for the whole product: the wordmark, document titles.
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["700", "900"],
  display: "swap",
  variable: "--font-playfair",
});

export const metadata: Metadata = {
  title: "Archer",
  description: LEDE,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
