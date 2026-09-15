"use client";

import { useState } from "react";
import { Dialog, Icon, IconButton } from "./ui";

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

export function ConnectAgentDialog({
  open,
  onClose,
  workspaceId,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string | null;
}) {
  const id = workspaceId ?? "<workspace-id>";
  const command = `claude mcp add archer --env ARCHER_WORKSPACE_ID=${id} -- pnpm --dir <repo>/packages/mcp start`;
  return (
    <Dialog open={open} onClose={onClose} title="Connect an agent" width={520}>
      <p className="text-base text-ink-2">
        Archer ships an MCP server. Any MCP-capable agent you point at it can read
        and edit every document in this workspace, with the same tools you have on
        the canvas.
      </p>
      <p className="pt-2 text-base text-ink-2">
        Register it with Claude Code by running this once, replacing{" "}
        <span className="mono text-sm text-ink">&lt;repo&gt;</span> with the path to
        your checkout:
      </p>

      <div className="mt-3 flex items-start gap-2 rounded-md border border-line bg-surface-2 p-3">
        <code className="mono min-w-0 flex-1 whitespace-pre-wrap break-all text-sm leading-relaxed text-ink">
          {command}
        </code>
        <CopyButton text={command} label="Copy command" />
      </div>

      <div className="mt-3 flex items-center gap-2 text-sm">
        <span className="text-ink-2">Workspace ID</span>
        <span className="mono min-w-0 flex-1 truncate rounded-xs bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2">
          {id}
        </span>
        <CopyButton text={id} label="Copy workspace ID" />
      </div>

      <p className="pt-3 text-xs text-ink-3">
        Tool reference and setup for other agents: <span className="mono">docs/mcp.md</span>{" "}
        in the repository.
      </p>
    </Dialog>
  );
}
