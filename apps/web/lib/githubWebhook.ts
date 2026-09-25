import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Check a GitHub webhook delivery's `X-Hub-Signature-256` header
 * (`sha256=<hex HMAC-SHA256 of the raw body>`) against the webhook secret,
 * in constant time. Server code only (node:crypto); see
 * app/api/github/webhook/route.ts.
 */
export function verifyWebhookSignature(secret: string, rawBody: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
