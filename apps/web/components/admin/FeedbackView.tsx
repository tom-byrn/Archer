"use client";

import { useMemo } from "react";
import type { AdminUser } from "@/lib/adminMetrics";
import { relativeTime } from "../ui";
import { Panel } from "./AdminChrome";
import { UserCell, dateTime, fallbackUser } from "./common";

export interface FeedbackItem {
  _id: string;
  at: number;
  userId: string;
  message: string;
  /** The page it was sent from; "/mcp" when an agent sent it (`device` is then the agent). */
  path: string;
  device: string | null;
}

/** Feedback sent from "Send feedback" or the MCP tool `send_feedback`, newest first, with who sent it. */
export function FeedbackView({ items, users }: { items: FeedbackItem[]; users: AdminUser[] }) {
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  return (
    <Panel title="Feedback" action={`${items.length} message${items.length === 1 ? "" : "s"}, all time, newest first`} flush>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-3">No feedback yet.</p>
      ) : (
        <ol className="divide-y divide-line">
          {items.map((f) => (
            <li key={f._id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <UserCell user={byId.get(f.userId) ?? fallbackUser(f.userId)} />
                </div>
                <time className="whitespace-nowrap pt-0.5 text-xs text-ink-3" title={dateTime(f.at)}>
                  {relativeTime(f.at)}
                </time>
              </div>
              <p className="whitespace-pre-wrap break-words text-base text-ink">{f.message}</p>
              <p className="mono text-xs text-ink-3">
                {f.path}
                {f.device && ` · ${f.device}`}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
