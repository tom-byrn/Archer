"use client";

import { useState, useEffect } from "react";
import { SITE_URL } from "@/lib/site";
import { Dialog, Icon, IconButton, SwapIcon } from "./ui";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <IconButton
      label={done ? "Copied" : label}
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      <SwapIcon swapped={done} from={<Icon.Copy />} to={<Icon.Check />} />
    </IconButton>
  );
}

const docsLink = "text-ink-2 underline decoration-line-2 underline-offset-2 hover:text-ink";

/** `claude mcp add` for the hosted server at this origin. */
const hostedCommand = (url: string) => `claude mcp add --transport http archer ${url}`;

/** The published CLI talks to the production app (SITE_URL); other origins (previews, local dev) must be named. */
const cliCommand = (origin: string) =>
  origin && origin !== SITE_URL ? `ARCHER_APP_URL=${origin} npx archerctl login` : "npx archerctl login";

export function ConnectAgentDialog({
  open,
  onClose,
  workspaceName,
}: {
  open: boolean;
  onClose: () => void;
  workspaceName: string;
}) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const mcpUrl = `${origin || SITE_URL}/mcp`;

  return (
    <Dialog open={open} onClose={onClose} title="Connect an agent" width={540}>
      <p className="text-base text-ink-2">
        Agents reach Archer through its MCP server. Add it once and sign in from the
        browser window your agent opens — no keys to copy. The agent gets your access:
        every workspace you belong to, starting in{" "}
        <span className="font-medium text-ink">{workspaceName}</span>.
      </p>

      <div className="mt-4">
        <div className="flex h-6 items-center">
          <span className="eyebrow">Claude Code</span>
        </div>
        <div className="flex items-start gap-2 rounded-md border border-line bg-surface-2 p-2.5">
          <code className="mono min-w-0 flex-1 whitespace-pre-wrap break-all text-sm leading-relaxed text-ink">
            {hostedCommand(mcpUrl)}
          </code>
          <CopyButton text={hostedCommand(mcpUrl)} label="Copy command" />
        </div>
        <p className="pt-1.5 text-xs text-ink-3">
          Then run <span className="mono">/mcp</span> in Claude Code, pick{" "}
          <span className="mono">archer</span>, and approve the sign-in.
        </p>
      </div>

      <div className="mt-4">
        <div className="flex h-6 items-center">
          <span className="eyebrow">Any other MCP client</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-line bg-surface-2 p-2.5">
          <code className="mono min-w-0 flex-1 truncate text-sm text-ink">{mcpUrl}</code>
          <CopyButton text={mcpUrl} label="Copy URL" />
        </div>
        <p className="pt-1.5 text-xs text-ink-3">
          Add it as a remote (Streamable HTTP) server. Sign-in uses standard MCP OAuth.
        </p>
      </div>

      <div className="mt-4">
        <div className="flex h-6 items-center">
          <span className="eyebrow">Command line</span>
        </div>
        <div className="flex items-start gap-2 rounded-md border border-line bg-surface-2 p-2.5">
          <code className="mono min-w-0 flex-1 whitespace-pre-wrap break-all text-sm leading-relaxed text-ink">
            {cliCommand(origin)}
          </code>
          <CopyButton text={cliCommand(origin)} label="Copy command" />
        </div>
        <p className="pt-1.5 text-xs text-ink-3">
          Signs the <span className="mono">archer</span> CLI in the same way, for push, pull and
          list. <span className="mono">archer check</span> needs no sign-in, so it runs anywhere,
          CI included.
        </p>
      </div>

      <p className="pt-4 text-xs text-ink-3">
        More in the docs:{" "}
        <a href="/docs/mcp" target="_blank" rel="noopener" className={docsLink}>
          MCP server
        </a>{" "}
        (other clients, every tool) and{" "}
        <a href="/docs/cli" target="_blank" rel="noopener" className={docsLink}>
          CLI
        </a>
        .
      </p>
    </Dialog>
  );
}
