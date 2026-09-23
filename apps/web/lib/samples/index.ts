/**
 * The dashboard's "From sample" gallery (`components/SampleDialog.tsx`).
 * Choosing a sample copies its source into the workspace as a new document,
 * so like the docs examples every source is canonical and validates clean;
 * `test/samples.test.ts` enforces it.
 *
 * Adding one: put its source in a module next to this one (named after the
 * slug), then list it below. The gallery shows samples in this order.
 */

import { ACME_SAAS } from "./acme-saas";

export interface Sample {
  /** Stable, URL-safe id. */
  slug: string;
  /** Matches the `arch "…"` header; the new document's title. */
  title: string;
  /** One short sentence under the preview (clamped to two lines). */
  description: string;
  source: string;
}

export const SAMPLES: readonly Sample[] = [
  {
    slug: "acme-saas",
    title: "Acme SaaS",
    description:
      "A Next.js app and API on Vercel, with Supabase Postgres, Cognito sign-in and Stripe checkout.",
    source: ACME_SAAS,
  },
];
