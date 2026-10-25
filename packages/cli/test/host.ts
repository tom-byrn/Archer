/**
 * A stand-in for the hosted Archer app, for end-to-end CLI tests:
 *   - an OAuth authorization server on its own origin (as Clerk is): discovery,
 *     dynamic client registration, authorization code + PKCE (S256), refresh
 *     with rotation, revocation;
 *   - the app origin, serving the protected-resource metadata and /mcp, which
 *     verifies bearer tokens like app/mcp/route.ts and then runs the REAL
 *     hosted tools (`handleRemoteRequest` from @archer/mcp/remote);
 *   - a fake Convex HTTP API behind those tools, holding state in memory and
 *     checking the service credential the way convex/access.ts does.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const USER = "user_tester";
export const TEAM = "team_acme";
const SECRET = "test-service-secret-0123456789abcdefghijkl";

type Json = Record<string, unknown>;
type Handler = (req: IncomingMessage, url: URL, body: string) => Promise<[number, Json | string, Record<string, string>?]>;

const readBody = (req: IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (c: string) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

async function listen(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>): Promise<[Server, string]> {
  const server = createServer((req, res) => {
    handler(req, res).catch((e: unknown) => {
      res.writeHead(500, { "content-type": "text/plain" }).end(String(e));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return [server, `http://127.0.0.1:${(server.address() as AddressInfo).port}`];
}

function route(handler: Handler) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", "http://x");
    const [status, body, headers] = await handler(req, url, await readBody(req));
    const json = typeof body !== "string";
    res.writeHead(status, { "content-type": json ? "application/json" : "text/plain", ...headers });
    res.end(json ? JSON.stringify(body) : body);
  };
}

const b64url = (buf: Buffer) => buf.toString("base64url");
const token = (prefix: string) => `${prefix}_${b64url(randomBytes(18))}`;

// ---------------------------------------------------------------------------
// fake Convex

interface DocRow {
  _id: string;
  workspaceId: string;
  title: string;
  source: string;
  updatedAt: number;
}

export class FakeConvex {
  docs = new Map<string, DocRow>();
  library = new Map<string, { tag: string; name: string; color: string; glyph: string }[]>();
  prefs = new Map<string, string>();
  /** Who saved what — the history the app shows. */
  saves: { documentId: string; author: { kind: string; name?: string }; summary?: string }[] = [];
  private seq = 0;

  private userFor(apiKey: unknown): string {
    // Same shape convex/access.ts accepts.
    const m = typeof apiKey === "string" ? /^svc_(.+)\.(user_[A-Za-z0-9]+)$/.exec(apiKey) : null;
    if (!m || m[1] !== SECRET) throw new Error("Not signed in.");
    return m[2]!;
  }

  private role(user: string, workspaceId: string): "owner" | "editor" | null {
    if (workspaceId === user) return "owner";
    if (workspaceId === TEAM && user === USER) return "editor";
    return null;
  }

  private need(args: Json): string {
    const user = this.userFor(args.apiKey);
    if (!this.role(user, String(args.workspaceId))) throw new Error("Not authorized for this workspace.");
    return user;
  }

  run(path: string, args: Json): unknown {
    // Like Convex's v.id("documents") validator.
    if ("id" in args && path.startsWith("documents:") && !/^doc\d+$/.test(String(args.id)))
      throw new Error(`ArgumentValidationError: Value does not match validator.\nPath: .id\nValue: "${args.id}"\nValidator: v.id("documents")`);
    switch (path) {
      case "workspaces:list": {
        const user = this.userFor(args.apiKey);
        return [
          { id: user, name: "Personal", kind: "personal", role: "owner" },
          ...(user === USER ? [{ id: TEAM, name: "Acme", kind: "team", role: "editor" }] : []),
        ];
      }
      case "agentPrefs:get": {
        const user = this.userFor(args.apiKey);
        const ws = this.prefs.get(user);
        return ws ? { workspaceId: ws, role: this.role(user, ws) } : null;
      }
      case "agentPrefs:set": {
        const user = this.userFor(args.apiKey);
        const ws = String(args.workspaceId);
        if (!this.role(user, ws)) throw new Error("You are not a member of that workspace.");
        this.prefs.set(user, ws);
        return { workspaceId: ws, role: this.role(user, ws) };
      }
      case "documents:list":
        this.need(args);
        return [...this.docs.values()]
          .filter((d) => d.workspaceId === args.workspaceId)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .map(({ _id, title, updatedAt, source }) => ({ _id, title, updatedAt, source }));
      case "documents:get": {
        this.need(args);
        const doc = this.docs.get(String(args.id));
        return doc && doc.workspaceId === args.workspaceId ? { ...doc } : null;
      }
      case "documents:create": {
        this.need(args);
        const _id = `doc${++this.seq}`;
        this.docs.set(_id, {
          _id,
          workspaceId: String(args.workspaceId),
          title: String(args.title),
          source: String(args.source),
          updatedAt: Date.now() + this.seq,
        });
        this.saves.push({ documentId: _id, author: args.author as { kind: string }, summary: args.summary as string });
        return _id;
      }
      case "documents:updateSource": {
        this.need(args);
        const doc = this.docs.get(String(args.id));
        if (!doc || doc.workspaceId !== args.workspaceId) return null;
        Object.assign(doc, { title: String(args.title), source: String(args.source), updatedAt: Date.now() + ++this.seq });
        this.saves.push({ documentId: doc._id, author: args.author as { kind: string }, summary: args.summary as string });
        return null;
      }
      case "library:list":
        this.need(args);
        return this.library.get(String(args.workspaceId)) ?? [];
      case "drift:get":
        this.need(args);
        return null;
      default:
        throw new Error(`fake convex: no function ${path}`);
    }
  }

  handler = route(async (req, url, body) => {
    if (req.method !== "POST" || !/^\/api\/(query|mutation)$/.test(url.pathname)) return [404, "not found"];
    const { path, args } = JSON.parse(body) as { path: string; args: Json[] };
    try {
      return [200, { status: "success", value: this.run(path, args[0] ?? {}) ?? null, logLines: [] }];
    } catch (e) {
      return [200, { status: "error", errorMessage: e instanceof Error ? e.message : String(e), logLines: [] }];
    }
  });
}

// ---------------------------------------------------------------------------
// OAuth authorization server

interface Grant {
  userId: string;
  clientId: string;
  expired?: boolean;
}

export class AuthServer {
  origin = "";
  clients = new Map<string, Json & { client_id: string; client_name?: string; redirect_uris: string[] }>();
  codes = new Map<string, { clientId: string; redirectUri: string; challenge: string; userId: string }>();
  access = new Map<string, Grant>();
  refresh = new Map<string, Grant>();
  revoked: string[] = [];
  /** The next /authorize answers like a user who clicked "Deny". */
  denyNext = false;

  handler = route(async (req, url, body) => {
    const form = new URLSearchParams(body);
    const oauthError = (error: string): [number, Json] => [400, { error }];
    switch (`${req.method} ${url.pathname}`) {
      case "GET /.well-known/oauth-authorization-server":
        return [
          200,
          {
            issuer: this.origin,
            authorization_endpoint: `${this.origin}/oauth/authorize`,
            token_endpoint: `${this.origin}/oauth/token`,
            registration_endpoint: `${this.origin}/oauth/register`,
            revocation_endpoint: `${this.origin}/oauth/revoke`,
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            code_challenge_methods_supported: ["S256"],
            token_endpoint_auth_methods_supported: ["none"],
            scopes_supported: ["profile", "email"],
          },
        ];
      case "POST /oauth/register": {
        const meta = JSON.parse(body) as Json & { redirect_uris: string[] };
        const client = { ...meta, client_id: token("client"), client_id_issued_at: Math.floor(Date.now() / 1000) };
        this.clients.set(client.client_id, client);
        return [201, client];
      }
      case "GET /oauth/authorize": {
        const p = url.searchParams;
        const client = this.clients.get(p.get("client_id") ?? "");
        const redirect = p.get("redirect_uri") ?? "";
        if (!client || !client.redirect_uris.includes(redirect)) return [400, "unknown client or redirect_uri"];
        if (p.get("code_challenge_method") !== "S256" || !p.get("code_challenge")) return [400, "PKCE required"];
        const back = new URL(redirect);
        back.searchParams.set("state", p.get("state") ?? "");
        if (this.denyNext) {
          this.denyNext = false;
          back.searchParams.set("error", "access_denied");
        } else {
          const code = token("code");
          this.codes.set(code, { clientId: client.client_id, redirectUri: redirect, challenge: p.get("code_challenge")!, userId: USER });
          back.searchParams.set("code", code);
        }
        return [302, "", { location: back.href }];
      }
      case "POST /oauth/token": {
        const clientId = form.get("client_id") ?? "";
        if (form.get("grant_type") === "authorization_code") {
          const code = this.codes.get(form.get("code") ?? "");
          this.codes.delete(form.get("code") ?? "");
          const verifier = form.get("code_verifier") ?? "";
          if (
            !code ||
            code.clientId !== clientId ||
            code.redirectUri !== form.get("redirect_uri") ||
            b64url(createHash("sha256").update(verifier).digest()) !== code.challenge
          )
            return oauthError("invalid_grant");
          return [200, this.issue({ userId: code.userId, clientId })];
        }
        if (form.get("grant_type") === "refresh_token") {
          const grant = this.refresh.get(form.get("refresh_token") ?? "");
          if (!grant || grant.clientId !== clientId) return oauthError("invalid_grant");
          this.refresh.delete(form.get("refresh_token")!); // rotation
          return [200, this.issue(grant)];
        }
        return oauthError("unsupported_grant_type");
      }
      case "POST /oauth/revoke": {
        const t = form.get("token") ?? "";
        this.revoked.push(t);
        this.refresh.delete(t);
        this.access.delete(t);
        return [200, {}];
      }
      default:
        return [404, "not found"];
    }
  });

  private issue(grant: Grant): Json {
    const access = token("at");
    const refresh = token("rt");
    this.access.set(access, { userId: grant.userId, clientId: grant.clientId });
    this.refresh.set(refresh, { userId: grant.userId, clientId: grant.clientId });
    return { access_token: access, token_type: "Bearer", expires_in: 3600, refresh_token: refresh, scope: "profile email" };
  }

  verify(header: string | undefined): Grant | null {
    const t = /^Bearer\s+(.+)$/i.exec(header ?? "")?.[1];
    const grant = t ? this.access.get(t) : undefined;
    return grant && !grant.expired ? grant : null;
  }

  expireAccessTokens(): void {
    for (const g of this.access.values()) g.expired = true;
  }

  forgetRefreshTokens(): void {
    this.refresh.clear();
  }
}

// ---------------------------------------------------------------------------
// the app: protected-resource metadata + /mcp

export interface Host {
  appUrl: string;
  as: AuthServer;
  convex: FakeConvex;
  /** Requests /mcp answered 401. */
  unauthorized: number;
  close: () => Promise<void>;
}

export async function startHost(): Promise<Host> {
  const as = new AuthServer();
  const convex = new FakeConvex();
  const [asServer, asOrigin] = await listen(as.handler);
  as.origin = asOrigin;
  const [convexServer, convexUrl] = await listen(convex.handler);

  let handleRemoteRequest: typeof import("@archer/mcp/remote").handleRemoteRequest;
  const host: Host = { appUrl: "", as, convex, unauthorized: 0, close: async () => {} };

  const [appServer, origin] = await listen(async (req, res) => {
    const url = new URL(req.url ?? "/", origin);
    if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
      // What Clerk's handler serves: the resource is the app origin.
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ resource: origin, authorization_servers: [asOrigin], scopes_supported: ["profile", "email"] }));
      return;
    }
    if (url.pathname !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    const grant = as.verify(req.headers.authorization);
    if (!grant) {
      host.unauthorized++;
      res.writeHead(401, {
        "content-type": "application/json",
        "www-authenticate": `Bearer error="invalid_token", resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
      });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "Invalid or expired access token" }, id: null }));
      return;
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    const body = await readBody(req);
    const response = await handleRemoteRequest(
      new Request(url, { method: req.method, headers, body: req.method === "GET" || req.method === "HEAD" ? undefined : body }),
      {
        token: "verified",
        clientId: grant.clientId,
        scopes: ["profile", "email"],
        userId: grant.userId,
        agentName: as.clients.get(grant.clientId)?.client_name ?? "agent",
      },
      // The real renderer lives in the web app; this one says what it was asked to draw.
      {
        renderSvg: (source, { theme, focus }) =>
          `<svg xmlns="http://www.w3.org/2000/svg" data-theme="${theme}" data-focus="${focus.join(".")}" data-length="${source.length}"></svg>`,
      },
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) for await (const chunk of response.body) res.write(chunk);
    res.end();
  });
  host.appUrl = origin;

  // backend.ts reads these at import time.
  process.env.CONVEX_URL = convexUrl;
  process.env.ARCHER_APP_URL = origin;
  process.env.ARCHER_SERVICE_SECRET = SECRET;
  ({ handleRemoteRequest } = await import("@archer/mcp/remote"));

  host.close = async () => {
    for (const s of [appServer, asServer, convexServer]) {
      s.closeAllConnections();
      await new Promise<void>((r) => s.close(() => r()));
    }
  };
  return host;
}
