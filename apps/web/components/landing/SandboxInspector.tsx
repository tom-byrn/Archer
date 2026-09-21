"use client";

import { lookupType } from "@archer/catalog";
import type { ReactNode } from "react";
import { Glyph } from "../nodes";
import { IconButton, Icon, cx } from "../ui";

/** A handful of catalog types to swap between — enough to show that a box is typed. */
export const SANDBOX_TYPES = [
  "vercel.nextjs",
  "vercel.functions",
  "aws.lambda",
  "clerk",
  "supabase.postgres",
  "neon",
  "redis",
  "stripe",
] as const;

export const SANDBOX_CONNECTION_TYPES = ["http", "grpc", "ws", "sql", "queue", "event"] as const;

function Option({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex h-6 items-center gap-1.5 rounded-sm border px-1.5 text-xs transition-colors duration-[120ms]",
        active
          ? "border-line-2 bg-surface-2 font-medium text-ink"
          : "border-transparent text-ink-2 hover:bg-surface-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export type SandboxSelection =
  | { kind: "node"; name: string; type?: string }
  | { kind: "edge"; name: string; type?: string };

/** Floating bar over the sandbox canvas: retype the selected box, or retype/delete the selected arrow. */
export function SandboxInspector({
  selection,
  onSetType,
  onDelete,
}: {
  selection: SandboxSelection;
  onSetType: (type: string) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex justify-center">
      <div className="pointer-events-auto flex max-w-full items-start gap-2 rounded-md border border-line-2 bg-surface px-2 py-1.5 shadow-md">
        <span className="mono flex h-6 shrink-0 items-center text-xs text-ink-3">{selection.name}</span>
        <span className="mt-1 h-4 w-px shrink-0 bg-line" />
        <div className="flex flex-wrap gap-0.5">
          {selection.kind === "node"
            ? SANDBOX_TYPES.map((tag) => (
                <Option key={tag} active={selection.type === tag} onClick={() => onSetType(tag)}>
                  <Glyph tag={tag} size={13} />
                  {lookupType(tag)?.name ?? tag}
                </Option>
              ))
            : SANDBOX_CONNECTION_TYPES.map((t) => (
                <Option key={t} active={selection.type === t} onClick={() => onSetType(t)}>
                  <span className="mono">{t}</span>
                </Option>
              ))}
        </div>
        {onDelete && (
          <>
            <span className="mt-1 h-4 w-px shrink-0 bg-line" />
            <IconButton label="Delete arrow" size="sm" onClick={onDelete} className="shrink-0">
              <Icon.Trash />
            </IconButton>
          </>
        )}
      </div>
    </div>
  );
}
