import { Newsreader } from "next/font/google";

/**
 * The landing headline's serif, loaded only by the pages that set it (the
 * landing page and its specimen on /branding). Inter and Playfair Display are
 * site-wide, in app/layout.tsx. Apply `newsreader.variable` to a wrapper.
 */
export const newsreader = Newsreader({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  display: "swap",
  variable: "--font-newsreader",
});
