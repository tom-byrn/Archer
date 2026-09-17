"use client";

import { useState } from "react";
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
  `claude mcp add archer --env ARCHER_API_KEY=${key} -- pnpm --dir <repo>/packages/mcp start`;

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
        Agents reach Archer through its MCP server and authenticate with an API key.
        Keys grant editor access to every document in{" "}
        <span className="font-medium text-ink">{workspaceName}</span>, so treat them
        like passwords.
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
            Register it with Claude Code, replacing{" "}
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

      <p className="pt-4 text-xs text-ink-3">
        Tool reference and setup for other agents: <span className="mono">docs/mcp.md</span>{" "}
        in the repository.
      </p>
    </Dialog>
  );
}
