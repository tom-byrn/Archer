"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button, Dialog, Icon, IconButton, Input, relativeTime } from "./ui";

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
      {done ? <Icon.Check /> : <Icon.Copy />}
    </IconButton>
  );
}

const commandFor = (key: string) =>
  `claude mcp add archer-local --env ARCHER_API_KEY=${key} -- pnpm --dir <repo>/packages/mcp start`;

/** `claude mcp add` for the hosted server at this origin. */
const hostedCommand = (url: string) => `claude mcp add --transport http archer ${url}`;

export function ConnectAgentDialog({
  open,
  onClose,
  workspaceId,
  workspaceName,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string | null;
  workspaceName: string;
}) {
  const keys = useQuery(api.apiKeys.list, open && workspaceId ? { workspaceId } : "skip");
  const create = useMutation(api.apiKeys.create);
  const revoke = useMutation(api.apiKeys.revoke);
  const [name, setName] = useState("Claude Code");
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<{ id: Id<"apiKeys">; key: string } | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const mcpUrl = `${origin || "https://archer.tombyrne.dev"}/mcp`;

  const mint = async () => {
    if (creating || !workspaceId) return;
    setCreating(true);
    try {
      const res = await create({ workspaceId, name });
      setFresh(res);
    } finally {
      setCreating(false);
    }
  };

  const close = () => {
    setFresh(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={close} title="Connect an agent" width={540}>
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

      <button
        type="button"
        onClick={() => setShowKeys((v) => !v)}
        className="mt-5 flex h-7 w-full items-center gap-1.5 rounded-md text-left text-sm font-medium text-ink-2 transition-colors hover:text-ink"
      >
        <Icon.ChevronRight
          className={`h-3.5 w-3.5 transition-transform duration-100 ${showKeys || fresh ? "rotate-90" : ""}`}
        />
        API keys
        <span className="font-normal text-ink-3">— for CI, the CLI, or a local server</span>
        {keys && keys.length > 0 && (
          <span className="ml-auto text-xs font-normal text-ink-3">{keys.length}</span>
        )}
      </button>

      {(showKeys || fresh) && (
      <div>
      <p className="pt-1 text-sm text-ink-2">
        A key grants editor access to every document in{" "}
        <span className="font-medium text-ink">{workspaceName}</span>. Treat it like a password.
      </p>

      {fresh && (
        <div className="mt-4 rounded-md border border-accent bg-accent-soft p-3">
          <div className="flex items-center gap-2">
            <Icon.Check className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold text-ink">New key created</span>
            <span className="ml-auto text-xs text-ink-2">
              Copy it now — it won&apos;t be shown again
            </span>
          </div>
          <div className="mt-2 flex items-start gap-2 rounded-md border border-line bg-surface p-2.5">
            <code className="mono min-w-0 flex-1 break-all text-sm leading-relaxed text-ink">
              {fresh.key}
            </code>
            <CopyButton text={fresh.key} label="Copy key" />
          </div>
          <p className="pt-3 text-sm text-ink-2">
            To run the server locally instead, register it with Claude Code, replacing{" "}
            <span className="mono text-xs text-ink">&lt;repo&gt;</span> with the path to your
            checkout:
          </p>
          <div className="mt-1.5 flex items-start gap-2 rounded-md border border-line bg-surface p-2.5">
            <code className="mono min-w-0 flex-1 whitespace-pre-wrap break-all text-sm leading-relaxed text-ink">
              {commandFor(fresh.key)}
            </code>
            <CopyButton text={commandFor(fresh.key)} label="Copy command" />
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="flex h-6 items-center">
          <span className="eyebrow">Your keys</span>
        </div>
        {keys === undefined ? (
          <p className="py-2 text-sm text-ink-3">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="py-2 text-sm text-ink-3">No keys yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {keys.map((k) => (
              <li key={k._id} className="flex h-9 items-center gap-3 px-3">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{k.name}</span>
                <span className="mono text-xs text-ink-3">{k.prefix}…</span>
                <span className="text-xs text-ink-3">{relativeTime(k.createdAt)}</span>
                <IconButton
                  label="Revoke key"
                  size="sm"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  onClick={() => {
                    if (fresh?.id === k._id) setFresh(null);
                    void revoke({ id: k._id });
                  }}
                >
                  <Icon.Trash />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name"
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") void mint();
          }}
        />
        <Button variant="primary" icon={<Icon.Plus />} disabled={creating} onClick={() => void mint()}>
          Create key
        </Button>
      </div>

      </div>
      )}

      <p className="pt-4 text-xs text-ink-3">
        Tool reference and setup for other agents: <span className="mono">docs/mcp.md</span>{" "}
        in the repository.
      </p>
    </Dialog>
  );
}
