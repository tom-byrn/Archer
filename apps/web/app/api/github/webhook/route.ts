import { handleWebhook, syncErrorResponse } from "@/lib/server/repoSync";
import { verifyWebhookSignature } from "@/lib/server/github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/github/webhook — GitHub deliveries, from the Archer GitHub App or
 * a repository webhook (content type application/json, secret
 * GITHUB_WEBHOOK_SECRET). A push that changes a stored document's file syncs
 * that document right away, so its canvas (and share links, and README image
 * embeds) follow the branch without anyone opening the app. Public in
 * middleware.ts: the signature is the authentication.
 */
export async function POST(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "Webhooks are not configured (GITHUB_WEBHOOK_SECRET)." }, { status: 503 });
  const raw = await req.text();
  if (!verifyWebhookSignature(secret, raw, req.headers.get("x-hub-signature-256")))
    return Response.json({ error: "Bad signature" }, { status: 401 });
  const event = req.headers.get("x-github-event") ?? "";
  if (event === "ping") return Response.json({ ok: true });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Expected a JSON payload (content type application/json)." }, { status: 400 });
  }
  try {
    return Response.json(await handleWebhook(event, payload as Parameters<typeof handleWebhook>[1]));
  } catch (e) {
    return syncErrorResponse(e);
  }
}
