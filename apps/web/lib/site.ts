/** Public origin, used wherever an absolute URL leaves the app (agent prompt, OG tags). */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://archer.tombyrne.dev"
).replace(/\/$/, "");
