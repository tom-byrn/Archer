/**
 * Build-time configuration. Expo inlines `EXPO_PUBLIC_*` variables only when
 * they're read as written here (`process.env.EXPO_PUBLIC_…`), from
 * apps/mobile/.env.local or the build's environment.
 */

const clean = (v: string | undefined): string | undefined => (v && v.trim() !== "" ? v.trim() : undefined);

/** The Convex deployment the web app uses (its NEXT_PUBLIC_CONVEX_URL). */
export const CONVEX_URL = clean(process.env.EXPO_PUBLIC_CONVEX_URL);

/** The Clerk instance the web app signs in with (its NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY). */
export const CLERK_PUBLISHABLE_KEY = clean(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY);

/** Where the web app lives: links out ("Open on the web", share links, docs). */
export const SITE_URL = (clean(process.env.EXPO_PUBLIC_SITE_URL) ?? "https://tryarcher.dev").replace(/\/+$/, "");

/** Whether accounts work in this build: without both, only the examples and nothing signed in. */
export const ACCOUNTS_CONFIGURED = CONVEX_URL !== undefined && CLERK_PUBLISHABLE_KEY !== undefined;
