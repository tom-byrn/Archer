import { ICON_GROUPS, ICON_KEYWORDS } from "@archer/catalog/icons";

// How the icon picker (components/IconPicker.tsx) names and searches icons.

/** "shopping_cart" → "Shopping cart". */
export const iconLabel = (name: string): string => {
  const words = name.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Every icon, in picker order. */
export const ALL_ICONS = ICON_GROUPS.flatMap((g) => g.icons);

/**
 * Search rank of an icon (`q` lowercased): 0 = its name starts with `q`,
 * 1 = every word of `q` starts a word of its name, 2 = every word of `q`
 * starts one of its keywords (Phosphor's name and tags too), -1 = no match.
 */
export const iconRank = (name: string, q: string): number => {
  if (q === "") return 1;
  if (name.startsWith(q.replace(/[\s-]+/g, "_"))) return 0;
  const terms = q.split(/[\s_-]+/).filter((t) => t !== "");
  const covers = (words: string[]) => terms.every((t) => words.some((w) => w.startsWith(t)));
  if (covers(name.split("_"))) return 1;
  return covers((ICON_KEYWORDS[name] ?? "").split(" ")) ? 2 : -1;
};
