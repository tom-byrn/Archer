/**
 * Server-side wrapper for Context.dev (https://docs.context.dev).
 *
 * ALL Context.dev calls in Archer go through this module — never call the SDK
 * or REST API from anywhere else, and never import this from client code: the
 * API key (CONTEXT_DEV_API_KEY) is a server-side secret.
 *
 * Endpoints used:
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
