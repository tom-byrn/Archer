/**
 * The web dashboard's "From sample" gallery (apps/web/components/SampleDialog.tsx),
 * and the `list_samples` / `get_sample` tools for agents. Choosing a sample
 * copies its source into the workspace as a new document, so like the docs
 * examples every source is canonical and validates clean;
 * apps/web/test/samples.test.ts enforces it.
 *
 * Adding one: put its source in a module next to this one (named after the
 * slug), then list it below. The gallery shows samples in this order.
 */

import { ACME_SAAS } from "./acme-saas";
import { AI_SUPPORT_AGENT } from "./ai-support-agent";

export { ACME_SAAS, AI_SUPPORT_AGENT };

export interface Sample {
  /** Stable, URL-safe id. */
  slug: string;
  /** Matches the `arch "…"` header; the new document's title. */
  title: string;
  /** One short sentence under the preview: two lines, about 75 characters. */
  description: string;
  source: string;
}

export const SAMPLES: readonly Sample[] = [
  {
    slug: "acme-saas",
    title: "Acme SaaS",
    description: "Next.js on Vercel, Supabase Postgres, Cognito sign-in and Stripe checkout.",
    source: ACME_SAAS,
  },
  {
    slug: "ai-support-agent",
    title: "AI Support Agent",
    description: "A Claude support agent with RAG, MCP tools, guardrails and human approval.",
    source: AI_SUPPORT_AGENT,
  },
];

export const findSample = (slug: string | null | undefined): Sample | undefined =>
  SAMPLES.find((s) => s.slug === slug);
