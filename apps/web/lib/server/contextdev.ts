/**
 * Server-side wrapper for Context.dev (https://docs.context.dev).
 *
 * ALL Context.dev calls in Archer go through this module — never call the SDK
 * or REST API from anywhere else, and never import this from client code: the
 * API key (CONTEXT_DEV_API_KEY) is a server-side secret.
 *
 * Endpoints used:
 * - POST /brand/retrieve (10 credits/lookup) — resolves a technology/company
 *   name or domain into a brand profile (title, canonical domain, brand
 *   colors, logos). Archer uses it to auto-style custom component types.
 *   Docs: https://docs.context.dev/guides/get-brand-data
 * - GET /web/styleguide (10 credits) — extracts a site's design system
 *   (colors, typography, spacing, shadows). Used one-off to source Archer's
 *   own theme tokens; not on any user-facing path.
 *   Docs: https://docs.context.dev/api-reference/brand-intelligence/styleguide
 */
import ContextDev from "context.dev";

let client: ContextDev | null = null;

function getClient(): ContextDev {
  const apiKey = process.env.CONTEXT_DEV_API_KEY;
  if (!apiKey) {
    throw new Error(
      "CONTEXT_DEV_API_KEY is not set. Add it to apps/web/.env.local (keys: https://www.context.dev/dashboard/api-keys).",
    );
  }
  client ??= new ContextDev({ apiKey });
  return client;
}

export interface BrandSuggestion {
  title: string;
  domain?: string;
  /** Primary brand color first, all #rrggbb. */
  colors: { hex: string; name?: string }[];
  logoUrl?: string;
}

/**
 * Fetch a site's design system (one-off tooling use; 10 credits).
 * `colorScheme` is part of the cache key — fetch light and dark separately.
 */
export async function getStyleguide(
  domain: string,
  colorScheme?: "light" | "dark",
): Promise<unknown> {
  return getClient().web.extractStyleguide({
    domain,
    ...(colorScheme ? { colorScheme } : {}),
    timeoutMS: 120_000,
    tags: ["archer:theme"],
  });
}

const DOMAIN_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Look up a brand by free-text name or domain. Returns null on a genuine
 * no-match (400/422). Retries 408/5xx once with backoff and honors
 * Retry-After on 429; validation errors are never retried.
 */
export async function suggestBrand(query: string): Promise<BrandSuggestion | null> {
  const q = query.trim();
  if (q === "") return null;
  const lookup = DOMAIN_RE.test(q)
    ? ({ type: "by_domain", domain: q.toLowerCase() } as const)
    : ({ type: "by_name", name: q } as const);

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await getClient().brand.retrieve({
        ...lookup,
        timeoutMS: 30_000,
        tags: ["archer:custom-type"],
      });
      const brand = response.brand;
      if (!brand?.title) return null;
      const colors = (brand.colors ?? [])
        .filter((c): c is { hex: string; name?: string } =>
          typeof c?.hex === "string" && HEX_RE.test(c.hex),
        )
        .map((c) => ({ hex: c.hex.toLowerCase(), name: c.name }));
      const logo = (brand.logos ?? []).find(
        (l) => typeof l?.url === "string" && (l.type === "icon" || l.type === "logo"),
      );
      return {
        title: brand.title,
        domain: brand.domain ?? undefined,
        colors,
        logoUrl: logo?.url,
      };
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      // Genuine no-match / unusable input: not an error for our purposes.
      if (status === 400 || status === 422) return null;
      if (attempt >= 1) throw e;
      if (status === 429) {
        const retryAfter = Number(
          (e as { headers?: Record<string, string> }).headers?.["retry-after"],
        );
        await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 2000);
      } else if (status === 408 || (status !== undefined && status >= 500)) {
        await sleep(1500);
      } else {
        throw e; // auth/validation — retrying won't help
      }
    }
  }
}
