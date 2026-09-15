"use client";

/**
 * Right-hand panel for everything that lives next to a document: revision
 * history (with per-revision diff summaries and a diff view on the canvas),
 * question threads, and the latest drift report.
 */

import { useMemo, useState, type ReactNode } from "react";
import { diffDocs, parse, summarizeDiff, type DiffSummary } from "@archer/lang";
import type { Id } from "@/convex/_generated/dataModel";
import {
  authorLabel,
  driftCheckPrompt,
  type Author,
  type DocumentActivity,
  type DriftFinding,
  type Revision,
  type Thread,
} from "@/lib/activity";
import {
  Button,
  Chip,
  Dialog,
  Icon,
  IconButton,
  Input,
  Segmented,
  cx,
  relativeTime,
} from "./ui";

export type ActivityTab = "history" | "questions" | "drift";

export interface ActivityPanelProps {
  tab: ActivityTab;
  onTabChange: (t: ActivityTab) => void;
  onClose: () => void;
  activity: DocumentActivity;
  documentId: string;
  title: string;
  /** Revision currently shown in diff mode on the canvas, or null. */
  viewingRevisionId: Id<"revisions"> | null;
  /** null exits diff mode. */
  onViewRevision: (id: Id<"revisions"> | null) => void;
  onRestore: (source: string) => void;
  onSelectPath: (path: string) => void;
  onAddComponent: (name: string, src?: string) => void;
}

/* ------------------------------------------------------------------ Shared */

function Avatar({ author }: { author: Author }) {
  const agent = author.kind === "agent";
  return (
    <span
      className={cx(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full [&>svg]:h-3.5 [&>svg]:w-3.5",
        agent ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-2",
      )}
      title={authorLabel(author)}
    >
      {agent ? <Icon.Bot /> : <Icon.User />}
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-6 text-center text-sm leading-relaxed text-ink-3">{children}</p>;
}

function useCopy(): [copied: boolean, copy: (text: string) => void] {
  const [copied, setCopied] = useState(false);
  return [
    copied,
    (text) => {
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    },
  ];
}

/* ----------------------------------------------------------------- History */

const dayLabel = (ts: number, now: number): string => {
  const d = new Date(ts);
  const n = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(n) - startOf(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === n.getFullYear() ? {} : { year: "numeric" }),
  });
};

function ChangeChips({ summary }: { summary: DiffSummary | null }) {
  if (summary === null) return <Chip>Initial version</Chip>;
  const conn = summary.connectionsAdded + summary.connectionsRemoved;
  const chips: ReactNode[] = [];
  if (summary.added > 0) chips.push(<Chip key="a" tone="accent">+{summary.added}</Chip>);
  if (summary.removed > 0) chips.push(<Chip key="r" tone="danger">−{summary.removed}</Chip>);
  if (summary.changed > 0) chips.push(<Chip key="c" tone="warn">~{summary.changed}</Chip>);
  if (conn > 0) chips.push(<Chip key="n">{conn} conn</Chip>);
  if (chips.length === 0) chips.push(<Chip key="0">No component changes</Chip>);
  return <span className="flex flex-wrap gap-1">{chips}</span>;
}

function HistoryTab({
  revisions,
  viewingRevisionId,
  onViewRevision,
  onRestore,
}: {
  revisions: Revision[];
  viewingRevisionId: Id<"revisions"> | null;
  onViewRevision: (id: Id<"revisions"> | null) => void;
  onRestore: (source: string) => void;
}) {
  const [confirmRestore, setConfirmRestore] = useState(false);
  const now = Date.now();

  // Diff each revision against the next-older one (list is newest first).
  const summaries = useMemo(() => {
    const m = new Map<string, DiffSummary | null>();
    revisions.forEach((rev, i) => {
      const older = revisions[i + 1];
      if (!older) {
        m.set(rev._id, null);
        return;
      }
      try {
        m.set(rev._id, summarizeDiff(diffDocs(parse(older.source).doc, parse(rev.source).doc)));
      } catch {
        m.set(rev._id, null);
      }
    });
    return m;
  }, [revisions]);

  const viewing = viewingRevisionId ? revisions.find((r) => r._id === viewingRevisionId) : undefined;

  if (revisions.length === 0) {
    return (
      <Empty>Every save lands here. Agent edits are listed by name so you can review them.</Empty>
    );
  }

  let lastDay = "";
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {viewing && (
        <div className="sticky top-0 z-10 border-b border-line bg-surface px-3 py-2">
          <p className="text-xs text-ink-2">
            Viewing this revision · compared with the previous one
          </p>
          <div className="flex gap-1.5 pt-1.5">
            <Button size="sm" icon={<Icon.Restore />} onClick={() => setConfirmRestore(true)}>
              Restore
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onViewRevision(null)}>
              Exit
            </Button>
          </div>
          <Dialog
            open={confirmRestore}
            onClose={() => setConfirmRestore(false)}
            title="Restore this version?"
            width={400}
          >
            <p className="text-sm text-ink-2">
              The current document will be saved as a new revision first, so nothing is lost.
            </p>
            <div className="flex justify-end gap-1.5 pt-4">
              <Button variant="ghost" onClick={() => setConfirmRestore(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirmRestore(false);
                  onRestore(viewing.source);
                }}
              >
                Restore
              </Button>
            </div>
          </Dialog>
        </div>
      )}
      <ul className="pb-3">
        {revisions.map((rev) => {
          const day = dayLabel(rev.createdAt, now);
          const header = day !== lastDay;
          lastDay = day;
          const active = rev._id === viewingRevisionId;
          return (
            <li key={rev._id}>
              {header && <div className="eyebrow px-3 pb-1 pt-3">{day}</div>}
              <button
                type="button"
                onClick={() => onViewRevision(active ? null : rev._id)}
                className={cx(
                  "flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors duration-100",
                  active ? "bg-accent-soft" : "hover:bg-surface-2",
                )}
              >
                <Avatar author={rev.author} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="truncate text-sm font-medium text-ink">
                      {authorLabel(rev.author)}
                    </span>
                    <span className="shrink-0 text-xs text-ink-3">
                      {relativeTime(rev.createdAt, now)}
                    </span>
                  </span>
                  {rev.summary && (
                    <span className="line-clamp-2 block text-sm text-ink-2">{rev.summary}</span>
                  )}
                  <span className="block pt-1">
                    <ChangeChips summary={summaries.get(rev._id) ?? null} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------- Questions */

function ThreadCard({
  thread,
  activity,
  onSelectPath,
}: {
  thread: Thread;
  activity: DocumentActivity;
  onSelectPath: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const now = Date.now();
  const first = thread.messages[0];
  const send = () => {
    const text = draft.trim();
    if (text === "") return;
    void activity.reply(thread._id, text).then(() => setDraft(""));
  };
  return (
    <li className="border-b border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors duration-100 hover:bg-surface-2"
      >
        <span className="flex items-center gap-2">
          <span
            role="link"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onSelectPath(thread.path);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                onSelectPath(thread.path);
              }
            }}
            className="mono truncate text-xs text-accent hover:underline"
          >
            {thread.path}
          </span>
          <span className="ml-auto shrink-0 text-xs text-ink-3">
            {thread.messages.length} {thread.messages.length === 1 ? "message" : "messages"}
          </span>
        </span>
        {first && !open && (
          <span className="line-clamp-2 text-sm text-ink">{first.text}</span>
        )}
        {first && (
          <span className="text-xs text-ink-3">
            {authorLabel(first.author)} · {relativeTime(first.at, now)}
          </span>
        )}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <ul className="flex flex-col gap-2.5">
            {thread.messages.map((m, i) => (
              <li key={i} className="flex items-start gap-2">
                <Avatar author={m.author} />
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-pre-wrap text-sm text-ink">{m.text}</span>
                  <span className="block text-xs text-ink-3">
                    {authorLabel(m.author)} · {relativeTime(m.at, now)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-1 pt-2.5">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Reply…"
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
            <IconButton label="Send" size="sm" onClick={send} disabled={draft.trim() === ""}>
              <Icon.Send />
            </IconButton>
          </div>
          <div className="pt-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                void activity.setThreadStatus(
                  thread._id,
                  thread.status === "open" ? "resolved" : "open",
                )
              }
            >
              {thread.status === "open" ? "Resolve" : "Reopen"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function QuestionsTab({
  activity,
  onSelectPath,
}: {
  activity: DocumentActivity;
  onSelectPath: (path: string) => void;
}) {
  const [showResolved, setShowResolved] = useState(false);
  const open = activity.threads.filter((t) => t.status === "open");
  const resolved = activity.threads.filter((t) => t.status === "resolved");
  if (activity.threads.length === 0) {
    return (
      <Empty>
        No questions. Agents ask here when the architecture is ambiguous; you can also ask on
        any component from its inspector.
      </Empty>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {open.length === 0 && <Empty>No open questions.</Empty>}
      <ul>
        {open.map((t) => (
          <ThreadCard key={t._id} thread={t} activity={activity} onSelectPath={onSelectPath} />
        ))}
      </ul>
      {resolved.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowResolved((s) => !s)}
            className="flex h-8 w-full items-center gap-1 px-3 text-left hover:bg-surface-2"
          >
            <Icon.ChevronRight
              className={cx("h-3 w-3 text-ink-3 transition-transform", showResolved && "rotate-90")}
            />
            <span className="eyebrow">Resolved ({resolved.length})</span>
          </button>
          {showResolved && (
            <ul className="opacity-80">
              {resolved.map((t) => (
                <ThreadCard key={t._id} thread={t} activity={activity} onSelectPath={onSelectPath} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- Drift */

const STATUS: Record<
  DriftFinding["status"],
  { label: string; tone: "danger" | "warn" | "neutral" }
> = {
  missing: { label: "Missing", tone: "danger" },
  changed: { label: "Changed", tone: "warn" },
  extra: { label: "Not in diagram", tone: "neutral" },
};

function DriftTab({
  activity,
  documentId,
  title,
  onSelectPath,
  onAddComponent,
}: {
  activity: DocumentActivity;
  documentId: string;
  title: string;
  onSelectPath: (path: string) => void;
  onAddComponent: (name: string, src?: string) => void;
}) {
  const [copied, copy] = useCopy();
  const prompt = driftCheckPrompt(documentId, title);
  const report = activity.drift;
  const now = Date.now();

  if (!report) {
    return (
      <div className="px-3 py-3">
        <p className="text-sm leading-relaxed text-ink-2">
          A drift check compares this document with your codebase. Paste this prompt into your
          agent:
        </p>
        <pre className="mono mt-2 whitespace-pre-wrap rounded-md border border-line bg-surface-2 p-2.5 text-xs leading-relaxed text-ink-2">
          {prompt}
        </pre>
        <div className="pt-2">
          <Button size="sm" icon={<Icon.Copy />} onClick={() => copy(prompt)}>
            {copied ? "Copied" : "Copy prompt"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        <span className="min-w-0 truncate text-xs text-ink-2">
          Checked by {authorLabel(report.author)} · {relativeTime(report.reportedAt, now)}
        </span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => copy(prompt)}>
          {copied ? "Copied" : "Copy prompt"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void activity.clearDrift()}>
          Clear
        </Button>
      </div>
      {report.findings.length === 0 ? (
        <div className="px-3 py-4">
          <Chip tone="accent">
            <Icon.Check className="h-3 w-3" />
            In sync with the code
          </Chip>
        </div>
      ) : (
        <ul>
          {report.findings.map((f, index) => {
            const s = STATUS[f.status];
            return (
              <li key={index} className="flex items-start gap-2 border-b border-line px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Chip tone={s.tone}>{s.label}</Chip>
                    {f.status === "extra" ? (
                      <span className="truncate text-sm font-medium text-ink">{f.name ?? "Unnamed"}</span>
                    ) : f.path ? (
                      <button
                        type="button"
                        onClick={() => onSelectPath(f.path!)}
                        className="mono truncate text-xs text-accent hover:underline"
                      >
                        {f.path}
                      </button>
                    ) : null}
                  </span>
                  {f.note && <span className="block pt-1 text-sm text-ink-2">{f.note}</span>}
                  {f.src && (
                    <span className="mono block truncate pt-0.5 text-xs text-ink-3" title={f.src}>
                      {f.src}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  {f.status === "extra" && (
                    <Button size="sm" onClick={() => onAddComponent(f.name ?? "Untitled", f.src)}>
                      Add
                    </Button>
                  )}
                  <IconButton
                    label="Dismiss"
                    size="sm"
                    onClick={() => void activity.dismissFinding(index)}
                  >
                    <Icon.Close />
                  </IconButton>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- Panel */

export function ActivityPanel({
  tab,
  onTabChange,
  onClose,
  activity,
  documentId,
  title,
  viewingRevisionId,
  onViewRevision,
  onRestore,
  onSelectPath,
  onAddComponent,
}: ActivityPanelProps) {
  const openQuestions = activity.threads.filter((t) => t.status === "open").length;
  const findings = activity.drift?.findings.length ?? 0;
  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-l border-line bg-surface">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-2">
        <Segmented<ActivityTab>
          value={tab}
          onChange={onTabChange}
          options={[
            { value: "history", label: "History" },
            {
              value: "questions",
              label: openQuestions > 0 ? `Questions · ${openQuestions}` : "Questions",
            },
            { value: "drift", label: findings > 0 ? `Drift · ${findings}` : "Drift" },
          ]}
        />
        <IconButton label="Close" onClick={onClose} className="ml-auto">
          <Icon.Close />
        </IconButton>
      </div>
      {tab === "history" && (
        <HistoryTab
          revisions={activity.revisions}
          viewingRevisionId={viewingRevisionId}
          onViewRevision={onViewRevision}
          onRestore={onRestore}
        />
      )}
      {tab === "questions" && <QuestionsTab activity={activity} onSelectPath={onSelectPath} />}
      {tab === "drift" && (
        <DriftTab
          activity={activity}
          documentId={documentId}
          title={title}
          onSelectPath={onSelectPath}
          onAddComponent={onAddComponent}
        />
      )}
    </aside>
  );
}
