import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { LEDE } from "@/lib/landingCopy";
import { SITE_URL } from "@/lib/site";

// The landing's headline and lede, so the link preview reads like the page.
const title = "Archer: software architecture for your agents";
const description = LEDE;

// Served at "/" for signed-out visitors (see middleware.ts).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // The tab just says "Archer"; the longer title is for link previews.
  title: "Archer",
  description,
  // For agents, the site in markdown: what Archer is and where its docs are.
  alternates: { canonical: "/", types: { "text/markdown": "/llms.txt" } },
  openGraph: { title, description, url: "/", siteName: "Archer", type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export default function WelcomePage() {
  return <Landing />;
}
