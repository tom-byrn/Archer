import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { SITE_URL } from "@/lib/site";

const title = "Archer: software architecture for your agents";
const description =
  "Draw your system on a canvas. Archer keeps it as a small text file your coding agent can read, build from and update.";

// Served at "/" for signed-out visitors (see middleware.ts).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // The tab just says "Archer"; the longer title is for link previews.
  title: "Archer",
  description,
  alternates: { canonical: "/" },
  openGraph: { title, description, url: "/", siteName: "Archer", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function WelcomePage() {
  return <Landing />;
}
