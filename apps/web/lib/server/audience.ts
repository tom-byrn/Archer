/**
 * Whether a JWT access token names `resource` as its audience. Clerk stamps
 * `aud` with the resource the client asked for (the MCP server is registered
 * in Clerk under `<origin>/mcp`), so a token issued for anything else — or
 * before that registration, with no `aud` — is refused and the client signs
 * in again. This only reads the claim: the caller must already have checked
 * the signature (the /mcp route does, through Clerk's auth()). @clerk/backend
 * ≥ 3.19 can do this itself with its `audience` option.
 */
export function audienceIncludes(token: string, resource: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
    const aud: unknown = payload?.aud;
    const auds = Array.isArray(aud) ? aud : [aud];
    return auds.some((a) => typeof a === "string" && a.replace(/\/+$/, "") === resource);
  } catch {
    return false;
  }
}
