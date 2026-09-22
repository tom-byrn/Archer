import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { auth, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { APP_URL, MCP_URL, VERSION, archerDir } from "./config";

// Sign-in is the MCP OAuth flow any agent runs against the hosted server:
// discovery, dynamic client registration, authorization code + PKCE in the
// browser with a loopback redirect, then refresh tokens. The result lives in
// ~/.archer/auth.json (0600), per server URL, and is only ever sent to that
// server's authorization server and to /mcp.

/** How the CLI appears on the consent screen and in project history. */
const CLIENT_NAME = "Archer CLI";
const CALLBACK_PATH = "/callback";

export class LoginRequired extends Error {
  constructor() {
    super(`Not signed in to ${APP_URL} (or the sign-in expired). Run: archer login`);
  }
}

// ---------------------------------------------------------------------------
// storage

interface Session {
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  discovery?: OAuthDiscoveryState;
}
interface Store {
  servers: Record<string, Session>;
}

const storeFile = (): string => join(archerDir(), "auth.json");

function readStore(): Store {
  try {
    const parsed = JSON.parse(readFileSync(storeFile(), "utf8")) as Partial<Store>;
    return { servers: parsed.servers ?? {} };
  } catch {
    return { servers: {} };
  }
}

function writeStore(store: Store): void {
  mkdirSync(archerDir(), { recursive: true, mode: 0o700 });
  // Write-then-rename, so a concurrent archer process never reads a torn file.
  const tmp = `${storeFile()}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, storeFile());
  try {
    chmodSync(storeFile(), 0o600);
  } catch {
    // best effort (e.g. Windows)
  }
}

// Always read from disk: a long-running `archer mcp` and a one-off command
// share the file, and either may refresh the tokens.
const session = (): Session => readStore().servers[MCP_URL] ?? {};

function updateSession(change: (s: Session) => void): void {
  const store = readStore();
  const s = store.servers[MCP_URL] ?? {};
  change(s);
  if (Object.keys(s).length === 0) delete store.servers[MCP_URL];
  else store.servers[MCP_URL] = s;
  writeStore(store);
}

export const signedIn = (): boolean => session().tokens !== undefined;

const registeredRedirect = (client: OAuthClientInformationMixed | undefined): string | undefined =>
  client && "redirect_uris" in client ? client.redirect_uris[0] : undefined;

// ---------------------------------------------------------------------------
// the SDK's view of that storage

interface BrowserFlow {
  redirectUrl: string;
  state: string;
  open: (url: URL) => void;
}

/**
 * Without a `flow` (every command but `archer login`) this provider can only
 * use and refresh an existing sign-in: registering a client or sending the
 * user to the browser throws LoginRequired instead.
 */
class StoredAuth implements OAuthClientProvider {
  private verifier: string | undefined;
  private handedOut: OAuthTokens | undefined;

  constructor(private readonly flow?: BrowserFlow) {}

  get redirectUrl(): string {
    // Must be set even when unused: without one the SDK picks a machine grant.
    return this.flow?.redirectUrl ?? registeredRedirect(session().client) ?? `http://localhost${CALLBACK_PATH}`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: CLIENT_NAME,
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  state(): string {
    return this.flow?.state ?? randomBytes(16).toString("base64url");
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    return session().client;
  }

  saveClientInformation(client: OAuthClientInformationMixed): void {
    if (!this.flow) throw new LoginRequired();
    updateSession((s) => {
      s.client = client;
    });
  }

  tokens(): OAuthTokens | undefined {
    this.handedOut = session().tokens;
    return this.handedOut;
  }

  saveTokens(tokens: OAuthTokens): void {
    updateSession((s) => {
      s.tokens = tokens;
    });
  }

  redirectToAuthorization(url: URL): void {
    if (!this.flow) throw new LoginRequired();
    this.flow.open(url);
  }

  saveCodeVerifier(verifier: string): void {
    this.verifier = verifier;
  }

  codeVerifier(): string {
    if (!this.verifier) throw new Error("No PKCE verifier for this sign-in.");
    return this.verifier;
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): void {
    if (scope === "verifier") {
      this.verifier = undefined;
      return;
    }
    updateSession((s) => {
      if (scope === "all" || scope === "client") delete s.client;
      // Another archer process may have refreshed since we read the tokens;
      // only drop the ones that failed.
      if ((scope === "all" || scope === "tokens") && s.tokens?.access_token === this.handedOut?.access_token)
        delete s.tokens;
      if (scope === "all" || scope === "discovery") delete s.discovery;
    });
  }

  saveDiscoveryState(state: OAuthDiscoveryState): void {
    updateSession((s) => {
      s.discovery = state;
    });
  }

  discoveryState(): OAuthDiscoveryState | undefined {
    return session().discovery;
  }
}

/** The stored sign-in, for transports; it refreshes but never starts a new sign-in. */
export const storedAuth = (): OAuthClientProvider => new StoredAuth();

// ---------------------------------------------------------------------------
// archer login / logout

/** Listen on loopback only — IPv4, plus IPv6 when present, since `localhost` may resolve to either. */
async function listenLoopback(
  port: number,
  handler: RequestListener,
): Promise<{ port: number; close: () => void }> {
  const listen = (host: string, p: number) =>
    new Promise<Server>((resolve, reject) => {
      const server = createServer(handler);
      server.once("error", reject);
      server.listen(p, host, () => resolve(server));
    });
  let v4: Server;
  try {
    v4 = await listen("127.0.0.1", port);
  } catch (e) {
    if (port === 0) throw e;
    v4 = await listen("127.0.0.1", 0); // the registered port is taken
  }
  const servers = [v4];
  const actual = (v4.address() as AddressInfo).port;
  try {
    servers.push(await listen("::1", actual));
  } catch {
    // no IPv6 loopback
  }
  return {
    port: actual,
    close: () => {
      for (const s of servers) {
        s.close();
        s.closeAllConnections();
      }
    },
  };
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {}); // no browser here: the printed URL is the fallback
    child.unref();
  } catch {
    // same
  }
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
  `<body style="font:16px system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem">` +
  `<h1 style="font-size:20px">${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></body>`;

export interface LoginOptions {
  /** Open the sign-in page in the default browser (the URL is printed either way). */
  browser: boolean;
  log: (line: string) => void;
  timeoutMs?: number;
}

/** Sign in through the browser and store the tokens. */
export async function login(opts: LoginOptions): Promise<void> {
  // A new sign-in replaces the old one; the client registration is reused.
  updateSession((s) => {
    delete s.tokens;
  });
  const registered = registeredRedirect(session().client);
  const state = randomBytes(16).toString("base64url");

  let settle!: { resolve: (code: string) => void; reject: (e: Error) => void };
  const code = new Promise<string>((resolve, reject) => {
    settle = { resolve, reject };
  });
  const loopback = await listenLoopback(registered ? Number(new URL(registered).port) : 0, (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== CALLBACK_PATH || url.searchParams.get("state") !== state) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
      return;
    }
    const error = url.searchParams.get("error");
    const got = url.searchParams.get("code");
    if (error || !got) {
      const why = url.searchParams.get("error_description") ?? error ?? "no authorization code";
      res.writeHead(400, { "content-type": "text/html; charset=utf-8" });
      res.end(page("Sign-in failed", `${why}. Run archer login to try again.`));
      settle.reject(new Error(`Sign-in was not completed: ${why}`));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(page("Signed in to Archer", "You can close this tab and return to the terminal."));
    settle.resolve(got);
  });

  try {
    const redirectUrl = `http://localhost:${loopback.port}${CALLBACK_PATH}`;
    // Redirect URIs are registered exactly, port included.
    if (registered && registered !== redirectUrl)
      updateSession((s) => {
        delete s.client;
      });
    const provider = new StoredAuth({
      redirectUrl,
      state,
      open: (url) => {
        opts.log(`Sign in to ${APP_URL} in your browser:\n  ${url.href}`);
        if (opts.browser) openBrowser(url.href);
      },
    });
    if ((await auth(provider, { serverUrl: MCP_URL })) === "REDIRECT") {
      const timeoutMs = opts.timeoutMs ?? 5 * 60_000;
      let timer: NodeJS.Timeout | undefined;
      const authorizationCode = await Promise.race([
        code,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Timed out waiting for the browser sign-in.")), timeoutMs);
        }),
      ]).finally(() => clearTimeout(timer));
      await auth(provider, { serverUrl: MCP_URL, authorizationCode });
    }
  } finally {
    loopback.close();
  }
}

/**
 * Forget the sign-in, revoking it first where the authorization server
 * supports that. The client registration is kept for the next login.
 * Returns whether there was a sign-in.
 */
export async function logout(): Promise<boolean> {
  const s = session();
  if (!s.tokens) return false;
  const endpoint = (s.discovery?.authorizationServerMetadata as { revocation_endpoint?: string } | undefined)
    ?.revocation_endpoint;
  const token = s.tokens.refresh_token ?? s.tokens.access_token;
  if (endpoint && s.client) {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token,
        token_type_hint: s.tokens.refresh_token ? "refresh_token" : "access_token",
        client_id: s.client.client_id,
      }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {});
  }
  updateSession((next) => {
    delete next.tokens;
  });
  return true;
}

/** The signed-in user's name/email, from the authorization server's OpenID userinfo endpoint. */
export async function userInfo(): Promise<{ name?: string; email?: string } | null> {
  const s = session();
  const endpoint = (s.discovery?.authorizationServerMetadata as { userinfo_endpoint?: string } | undefined)
    ?.userinfo_endpoint;
  if (!endpoint || !s.tokens) return null;
  try {
    const res = await fetch(endpoint, {
      headers: { authorization: `Bearer ${s.tokens.access_token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const info = (await res.json()) as { name?: string; preferred_username?: string; email?: string };
    return { name: info.name ?? info.preferred_username, email: info.email };
  } catch {
    return null;
  }
}

/** Older CLIs saved an API key here; keys no longer exist. True if one was removed. */
export function removeLegacyKey(): boolean {
  const file = join(archerDir(), "key");
  if (!existsSync(file)) return false;
  rmSync(file, { force: true });
  return true;
}

// ---------------------------------------------------------------------------

/** Every request is bounded, so a dead network fails a command instead of hanging it. */
const REQUEST_TIMEOUT_MS = 30_000;
const boundedFetch = (url: string | URL, init?: RequestInit): Promise<Response> => {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return fetch(url, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
};

/** An MCP client for the hosted server, signed in with the stored credentials. */
export async function connect(): Promise<Client> {
  if (!signedIn()) throw new LoginRequired();
  const client = new Client({ name: "archer-cli", version: VERSION });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: storedAuth(), fetch: boundedFetch }),
  );
  return client;
}
