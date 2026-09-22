"use client";

/**
 * Right-hand panel for everything that lives next to a document: revision
 * history (with per-revision diff summaries and a diff view on the canvas)
 * and the latest drift report.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { diffDocs, parse, summarizeDiff, type DiffSummary } from "@archer/lang";
import type { Id } from "@/convex/_generated/dataModel";
import {
  authorLabel,
  driftCheckPrompt,
  type Author,
  type DocumentActivity,
  type DriftFinding,
  type Revision,
} from "@/lib/activity";
import { repoKey, useCommits, type CommitsState, type GitHubCommit, type RepoLink } from "@/lib/github";
import {
  Button,
  Chip,
  Dialog,
  GitHubMark,
  Icon,
  IconButton,
  Segmented,
  SidePanel,
  cx,
  relativeTime,
} from "./ui";

export type ActivityTab = "history" | "drift";

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
  /** Linked GitHub repository, or null. */
  repo: RepoLink | null;
  /** Open the link-a-repository dialog (owned by the editor). */
  onLinkRepo: () => void;
}

type HistoryFilter = "all" | "architecture" | "code";
const FILTER_KEY = "archer.history.filter";

/* ------------------------------------------------------------------ Shared */

function CommitAvatar({ commit }: { commit: GitHubCommit }) {
  const label = commit.authorLogin ?? commit.authorName;
  if (commit.authorAvatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={commit.authorAvatar}
        alt=""
        title={label}
        className="h-6 w-6 shrink-0 rounded-full bg-surface-2"
      />
    );
  }
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-ink-2"
      title={label}
    >
      {label.slice(0, 2).toUpperCase()}
    </span>
  );
}

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
  const conn = summary.connectionsAdded + summary.connectionsRemoved + summary.connectionsChanged;
  const chips: ReactNode[] = [];
  if (summary.added > 0) chips.push(<Chip key="a" tone="accent">+{summary.added}</Chip>);
  if (summary.removed > 0) chips.push(<Chip key="r" tone="danger">−{summary.removed}</Chip>);
  if (summary.changed > 0) chips.push(<Chip key="c" tone="warn">~{summary.changed}</Chip>);
  if (conn > 0) chips.push(<Chip key="n">{conn} conn</Chip>);
  if (chips.length === 0) chips.push(<Chip key="0">No component changes</Chip>);
  return <span className="flex flex-wrap gap-1">{chips}</span>;
}

type TimelineItem =
  | { kind: "revision"; at: number; rev: Revision }
  | { kind: "commit"; at: number; commit: GitHubCommit };

function HistoryTab({
  revisions,
  viewingRevisionId,
  onViewRevision,
  onRestore,
  repo,
  onLinkRepo,
  commits,
}: {
  revisions: Revision[];
  viewingRevisionId: Id<"revisions"> | null;
  onViewRevision: (id: Id<"revisions"> | null) => void;
  onRestore: (source: string) => void;
  repo: RepoLink | null;
  onLinkRepo: () => void;
  commits: CommitsState;
}) {
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  useEffect(() => {
    try {
      const v = localStorage.getItem(FILTER_KEY);
      if (v === "all" || v === "architecture" || v === "code") setFilter(v);
    } catch {}
  }, []);
  const changeFilter = (f: HistoryFilter) => {
    setFilter(f);
    try {
      localStorage.setItem(FILTER_KEY, f);
    } catch {}
  };
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

  const items = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = [];
    if (filter !== "code")
      for (const rev of revisions) out.push({ kind: "revision", at: rev.createdAt, rev });
    if (filter !== "architecture" && repo)
      for (const commit of commits.commits)
        out.push({ kind: "commit", at: new Date(commit.date).getTime(), commit });
    return out.sort((a, b) => b.at - a.at);
  }, [revisions, commits.commits, filter, repo]);

  const viewing = viewingRevisionId ? revisions.find((r) => r._id === viewingRevisionId) : undefined;

  const repoHeader = (
    <div className="border-b border-line px-3 py-2">
      {repo ? (
        <div className="flex items-center gap-1.5">
          <GitHubMark className="h-3.5 w-3.5 shrink-0 text-ink-2" />
          <a
            href={`https://github.com/${repo.owner}/${repo.name}/tree/${encodeURIComponent(repo.branch)}`}
            target="_blank"
            rel="noreferrer"
            className="mono min-w-0 truncate text-xs text-ink hover:underline"
            title={`${repoKey(repo)} @ ${repo.branch}`}
          >
            {repoKey(repo)}
            <span className="text-ink-3">@{repo.branch}</span>
          </a>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onLinkRepo}>
            Change
          </Button>
        </div>
      ) : (
        <div>
          <Button size="sm" icon={<Icon.Link />} onClick={onLinkRepo}>
            Link repository
          </Button>
          <p className="pt-1.5 text-xs text-ink-3">
            See code commits alongside architecture changes.
          </p>
        </div>
      )}
      {repo && (
        <div className="pt-2">
          <Segmented<HistoryFilter>
            value={filter}
            onChange={changeFilter}
            options={[
              { value: "all", label: "All" },
              { value: "architecture", label: "Architecture" },
              { value: "code", label: "Code" },
            ]}
          />
        </div>
      )}
    </div>
  );

  let lastDay = "";
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {repoHeader}
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
      {items.length === 0 && !commits.loading && (
        <Empty>
          {filter === "code"
            ? "No commits on this branch yet."
            : "Every save lands here. Agent edits are listed by name so you can review them."}
        </Empty>
      )}
      <ul className="pb-3">
        {items.map((item) => {
          const day = dayLabel(item.at, now);
          const header = day !== lastDay;
          lastDay = day;
          if (item.kind === "commit") {
            const c = item.commit;
            const firstLine = c.message.split("\n")[0] ?? c.message;
            return (
              <li key={`c-${c.sha}`}>
                {header && <div className="eyebrow px-3 pb-1 pt-3">{day}</div>}
                <div className="flex items-start gap-2.5 border-l-2 border-line px-3 py-2">
                  <CommitAvatar commit={c} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block text-sm text-ink">{firstLine}</span>
                    <span className="flex items-center gap-1 pt-0.5 text-xs text-ink-3">
                      <span className="truncate">{c.authorLogin ?? c.authorName}</span>
                      <span>·</span>
                      <span className="shrink-0">{relativeTime(item.at, now)}</span>
                      <span>·</span>
                      <a
                        href={c.htmlUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mono inline-flex shrink-0 items-center gap-0.5 hover:text-ink hover:underline"
                        title="Open commit on GitHub"
                      >
                        {c.sha.slice(0, 7)}
                        <Icon.External className="h-2.5 w-2.5" />
                      </a>
                    </span>
                  </span>
                </div>
              </li>
            );
          }
          const rev = item.rev;
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
      {repo && filter !== "architecture" && (
        <div className="px-3 pb-3">
          {commits.error && <p className="pb-1 text-xs text-danger">{commits.error}</p>}
          {commits.loading ? (
            <p className="text-xs text-ink-3">Loading commits…</p>
          ) : commits.hasMore ? (
            <Button size="sm" variant="ghost" onClick={commits.loadMore}>
              Load older commits
            </Button>
          ) : null}
        </div>
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
  repo,
  commits,
}: {
  activity: DocumentActivity;
  documentId: string;
  title: string;
  onSelectPath: (path: string) => void;
  onAddComponent: (name: string, src?: string) => void;
  repo: RepoLink | null;
  commits: CommitsState;
}) {
  const [copied, copy] = useCopy();
  const prompt = driftCheckPrompt(documentId, title, repo);
  const report = activity.drift;
  const now = Date.now();
  // Commits that landed after the last check (loaded pages only).
  const sinceCheck = useMemo(() => {
    if (!report || !repo) return null;
    const newer = commits.commits.filter((c) => new Date(c.date).getTime() > report.reportedAt);
    const allNewer = newer.length === commits.commits.length && commits.commits.length > 0;
    return { count: newer.length, more: allNewer && commits.hasMore };
  }, [report, repo, commits.commits, commits.hasMore]);

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
        {sinceCheck && !commits.loading && (
          <Chip tone={sinceCheck.count > 0 ? "warn" : "accent"} className="shrink-0">
            {sinceCheck.count > 0
              ? `${sinceCheck.count}${sinceCheck.more ? "+" : ""} commits since`
              : "No commits since"}
          </Chip>
        )}
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
  repo,
  onLinkRepo,
}: ActivityPanelProps) {
  const commits = useCommits(repo);
  const findings = activity.drift?.findings.length ?? 0;
  return (
    <SidePanel tall resizable defaultWidth={512}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-2">
        <Segmented<ActivityTab>
          value={tab}
          onChange={onTabChange}
          options={[
            { value: "history", label: "History" },
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
          repo={repo}
          onLinkRepo={onLinkRepo}
          commits={commits}
        />
      )}
      {tab === "drift" && (
        <DriftTab
          activity={activity}
          documentId={documentId}
          title={title}
          onSelectPath={onSelectPath}
          onAddComponent={onAddComponent}
          repo={repo}
          commits={commits}
        />
      )}
    </SidePanel>
  );
}
