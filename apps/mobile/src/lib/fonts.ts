/**
 * The web app's faces (`apps/web/app/layout.tsx`, `lib/fonts.ts`): Inter for
 * everything, Playfair Display for the wordmark and document titles
 * (`font-display`, 700; the landing's big wordmark, 900), and Newsreader for
 * the landing headline. React Native picks a weight by family name, so each
 * weight is its own family here.
 */

import { Platform } from "react-native";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { PlayfairDisplay_700Bold } from "@expo-google-fonts/playfair-display/700Bold";
import { PlayfairDisplay_900Black } from "@expo-google-fonts/playfair-display/900Black";
import { Newsreader_500Medium } from "@expo-google-fonts/newsreader/500Medium";

/** What the root layout loads before it hides the splash screen. */
export const FONT_FILES = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  PlayfairDisplay_700Bold,
  PlayfairDisplay_900Black,
  Newsreader_500Medium,
};

export type Weight = "400" | "500" | "600" | "700";

const INTER: Record<Weight, string> = {
  "400": "Inter_400Regular",
  "500": "Inter_500Medium",
  "600": "Inter_600SemiBold",
  "700": "Inter_700Bold",
};

/** Inter at a weight (the family carries the weight; don't also set fontWeight). */
export const sans = (weight: Weight = "400"): string => INTER[weight];

/** `font-display`: Playfair Display 700, a hair tight. */
export const DISPLAY = { fontFamily: "PlayfairDisplay_700Bold", letterSpacing: -0.01 } as const;

/** The landing's huge faded wordmark: Playfair Display 900. */
export const WORDMARK_BLACK = "PlayfairDisplay_900Black";

/** The landing headline: Newsreader 500. */
export const HEADLINE = "Newsreader_500Medium";

/** `.mono`: the platform's monospace (the web's stack starts at ui-monospace / SF Mono). */
export const MONO = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
}) as string;
