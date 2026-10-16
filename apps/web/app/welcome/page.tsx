import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { LEDE } from "@/lib/landingCopy";
import { SITE_URL } from "@/lib/site";

// The link preview's title; the description is the landing's lede.
const title = "Ship code faster than you can read it, let your agents map it out.";
const description = LEDE;

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
