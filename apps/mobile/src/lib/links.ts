/** Share links: what the web app hands out (`/share/<slug>`), and reading one back. */

/** A public share slug: 16 base64url characters (`convex/access.ts` generateSlug). */
const SLUG = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * The share slug in whatever someone pasted: a full link
 * (`https://tryarcher.dev/share/<slug>`, its image URL, the older `/s/<slug>`,
 * the app's `archer://share/<slug>`) or the bare slug. Null when it holds none.
 */
export function shareSlugFrom(input: string): string | null {
  const text = input.trim();
  if (text === "") return null;
  const m = /(?:^|\/)(?:share|s)\/([^/?#\s]+)/.exec(text);
  const slug = m ? m[1]! : text;
  return SLUG.test(slug) ? slug : null;
}

/** The web page for a share slug. */
export const shareUrl = (site: string, slug: string): string => `${site}/share/${slug}`;
