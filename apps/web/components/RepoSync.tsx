"use client";

/**
 * Editor UI for where a document is stored (docs/repo-sync.md): the header's
 * storage control (Archer, or a file in GitHub with its sync status), the
 * Publish dialog, and the canvas banners for conflicts and sync problems.
 * Only stored documents get any of it; the sandbox never does.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  GitHubClientError,
  describeGitHubError,
  publishToGitHub,
  repoKey,
  storedFile,
  syncWithGitHub,
  type PublishResult,
  type RepoLink,
  type SyncOutcome,
} from "@/lib/github";
import { githubTreeUrl } from "@/lib/githubApi";
import {
  changeCount,
  describeChanges,
  publishTitle,
  syncStatus,
  type StoredFile,
  type SyncStatus,
} from "@/lib/repoSync";
import { findItem, parse } from "@archer/lang";

const FIELD_LABEL: Record<string, string> = {
  desc: "description",
  src: "source path",
  type: "type",
  name: "name",
  payloads: "payloads",
  shape: "shape",
  icon: "icon",
  color: "color",
  plane: "plane",
};
import {
  Button,
  Chip,
  Dialog,
  GitHubMark,
  Icon,
  IconButton,
  Input,
  Menu,
  Segmented,
  SplitButton,
  cx,
  relativeTime,
  type MenuItem,
} from "./ui";

/* ------------------------------------------------------------------- Hook */

export interface RepoSync {
  /** The file the document is stored in; null when it's stored in Archer. */
  file: StoredFile | null;
  /** The document's current source (for names in the publish summary). */
  source: string;
  status: SyncStatus | null;
  syncing: boolean;
  error: string | null;
  sync: () => Promise<SyncOutcome | null>;
  resolve: (keep: "draft" | "repo") => Promise<void>;
  publish: (mode: "pr" | "commit", message?: string) => Promise<PublishResult>;
}

const FOCUS_SYNC_MS = 30_000;

/**
 * Keep a stored document in step with its file: sync when it opens and when
 * the tab regains focus (the push webhook covers the rest), publish, and
 * settle conflicts. `flush` saves any pending edit first, so the server always
 * works from what's on screen.
 */
export function useRepoSync({
  documentId,
  workspaceId,
  repo,
  source,
  flush,
  onOutcome,
}: {
  documentId: string;
  workspaceId: string;
  repo: RepoLink | null;
  source: string;
  flush: () => Promise<void>;
  /** A sync that changed something (for the editor's toast). */
  onOutcome?: (o: SyncOutcome) => void;
}): RepoSync {
  const file = storedFile(repo);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const report = useRef(onOutcome);
  report.current = onOutcome;
  const flushRef = useRef(flush);
  flushRef.current = flush;

  const status = useMemo(
    () => (file ? syncStatus(file, source) : null),
    // The file object changes on every save; these are what the status depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [!!file, file?.base?.source, file?.incoming?.blob, source],
  );

  const stored = !!file;
  const key = file ? `${repoKey(file)}@${file.branch}/${file.path}` : null;

  const sync = useCallback(async () => {
    if (!stored) return null;
    setSyncing(true);
    try {
      await flushRef.current();
      const outcome = await syncWithGitHub(workspaceId, documentId);
      setError(null);
      report.current?.(outcome);
      return outcome;
    } catch (e) {
      setError(describeGitHubError(e));
      return null;
    } finally {
      setSyncing(false);
    }
  }, [stored, workspaceId, documentId]);

  // On open, and on focus at most every 30 s.
  useEffect(() => {
    if (!key) return;
    void sync();
    let last = Date.now();
    const onFocus = () => {
      if (Date.now() - last < FOCUS_SYNC_MS) return;
      last = Date.now();
      void sync();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [key, sync]);

  const resolve = useCallback(
    async (keep: "draft" | "repo") => {
      setSyncing(true);
      try {
        await flushRef.current();
        report.current?.(await syncWithGitHub(workspaceId, documentId, keep));
        setError(null);
      } finally {
        setSyncing(false);
      }
    },
    [workspaceId, documentId],
  );

  const publish = useCallback(
    async (mode: "pr" | "commit", message?: string) => {
      await flushRef.current();
      try {
        return await publishToGitHub(workspaceId, documentId, { mode, message });
      } catch (e) {
        // The file moved since the last sync: catch up, then try once more.
        if (!(e instanceof GitHubClientError) || e.code !== "stale") throw e;
        const outcome = await syncWithGitHub(workspaceId, documentId);
        report.current?.(outcome);
        if (outcome.status === "conflict")
          throw new Error("The file changed on the branch in ways that conflict with your draft. Resolve that first.");
        return publishToGitHub(workspaceId, documentId, { mode, message });
      }
    },
    [workspaceId, documentId],
  );

  return { file, source, status, syncing, error, sync, resolve, publish };
}

/** One line for a sync outcome worth a toast, or null. */
export function outcomeToast(o: SyncOutcome, f: StoredFile | null): string | null {
  const where = f ? f.branch : "the branch";
  switch (o.status) {
    case "imported":
      return `Updated from ${where} · ${o.author}`;
    case "merged":
      return `Merged ${o.author}'s changes from ${where}`;
    case "conflict":
      return `${f?.path ?? "The file"} changed on ${where} and conflicts with your draft`;
    default:
      return null;
  }
}

const fileUrl = (f: StoredFile) => githubTreeUrl(f.owner, f.name, f.branch, f.path).replace("/tree/", "/blob/");

/* -------------------------------------------------------- Header control */

/**
 * Where the document lives. Stored in Archer: a GitHub button offering Move to
 * GitHub. Stored in a file: one button whose label is the sync status (Synced,
 * Conflict, Sync problem) and which becomes the primary Publish button while
 * there's something to publish. Its menu names the file, repository and branch.
 */
export function StorageControl({
  sync,
  onMove,
  onStopSyncing,
  onPublish,
}: {
  sync: RepoSync;
  onMove: () => void;
  onStopSyncing: () => void;
  onPublish: () => void;
}) {
  const { file, status } = sync;
  if (!file || !status) {
    return (
      <Menu
        width={260}
        items={[
          {
            label: "Move to GitHub…",
            hint: "Store it in a .arch file in your repository",
            icon: <GitHubMark />,
            onSelect: onMove,
          },
        ]}
        trigger={({ open, toggle }) => (
          <IconButton label="Stored in Archer" active={open} onClick={toggle} aria-expanded={open}>
            <GitHubMark className="h-4 w-4" />
          </IconButton>
        )}
      />
    );
  }

  const where = `Stored in ${repoKey(file)}/${file.path} on ${file.branch}`;
  const count = status.kind === "draft" ? changeCount(status.summary) : null;
  // Publishing is also how a broken file gets fixed, so it outranks a sync
  // problem here (the canvas banner and the menu still report it).
  const canPublish = status.kind === "draft" || status.kind === "new";
  const tone = status.kind === "conflict" ? "text-danger" : file.problem ? "text-warn" : undefined;
  // While a sync runs the mark pulses and the label stays, so the header doesn't shift.
  const mark = <GitHubMark className={cx(sync.syncing ? "animate-pulse text-ink-3" : tone)} />;

  const items: (MenuItem | "separator")[] = [
    {
      label: "Open on GitHub",
      icon: <Icon.External />,
      onSelect: () => window.open(fileUrl(file), "_blank"),
    },
    ...(file.pr
      ? [{ label: `Open pull request #${file.pr.number}`, hint: "Published, waiting to merge", icon: <Icon.Send />, onSelect: () => window.open(file.pr!.url, "_blank") }]
      : []),
    {
      label: sync.syncing ? "Syncing…" : "Sync now",
      hint: sync.error ?? undefined,
      icon: <Icon.Restore />,
      disabled: sync.syncing,
      onSelect: () => void sync.sync(),
    },
    "separator",
    {
      label: "Stop syncing…",
      hint: "Keep the document in Archer instead",
      icon: <Icon.Close />,
      danger: true,
      onSelect: onStopSyncing,
    },
  ];

  return (
    <Menu
      width={288}
      header={<FileCard file={file} status={status} syncing={sync.syncing} />}
      items={items}
      trigger={({ open, toggle }) =>
        canPublish ? (
          <SplitButton
            icon={mark}
            onClick={onPublish}
            title={
              count !== null
                ? `Publish ${count} change${count === 1 ? "" : "s"} to ${file.path} on ${file.branch}`
                : `${file.path} isn't on ${file.branch} yet. Publishing creates it.`
            }
            menu={{ open, toggle, label: "More GitHub actions", title: where }}
          >
            {count !== null ? "Publish" : "Create file"}
            {count !== null && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-sm bg-bg/20 px-1 text-xs font-semibold">
                {count}
              </span>
            )}
          </SplitButton>
        ) : (
          <Button
            size="sm"
            icon={mark}
            onClick={toggle}
            aria-expanded={open}
            title={where}
            className="pr-2 aria-expanded:border-line-2 aria-expanded:bg-surface-2"
          >
            <span className={tone}>
              {status.kind === "conflict" ? "Conflict" : file.problem ? "Sync problem" : "Synced"}
            </span>
            <Icon.ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        )
      }
    />
  );
}

/** The top of the storage menu: the file, where it lives, and how the document stands with it. */
function FileCard({ file, status, syncing }: { file: StoredFile; status: SyncStatus; syncing: boolean }) {
  const n = status.kind === "draft" ? changeCount(status.summary) : 0;
  const glyph = "h-3 w-3 shrink-0";
  const line: { tone: string; icon?: ReactNode; text: string; detail?: string; title?: string } =
    status.kind === "conflict"
      ? { tone: "text-danger", icon: <Icon.Alert className={glyph} />, text: `Conflicts with changes on ${file.branch}` }
      : file.problem
        ? { tone: "text-warn", icon: <Icon.Warning className={glyph} />, text: file.problem.message }
        : status.kind === "draft"
          ? {
              tone: "text-warn",
              icon: <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />,
              text: `${n} unpublished change${n === 1 ? "" : "s"}`,
              detail: file.pr ? `PR #${file.pr.number} open` : undefined,
              title: describeChanges(status.summary),
            }
          : status.kind === "new"
            ? { tone: "text-ink-2", text: `Not on ${file.branch} yet` }
            : syncing
              ? { tone: "text-ink-3", text: `Checking ${file.branch}…` }
              : {
                  tone: "text-ink-2",
                  icon: <Icon.Check className={cx(glyph, "text-accent")} />,
                  text: "Synced",
                  detail: file.checkedAt ? `checked ${relativeTime(file.checkedAt)}` : undefined,
                };
  return (
    <div className="flex items-start gap-2.5 px-2 pb-1.5 pt-1.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink">
        <GitHubMark className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="mono truncate text-sm text-ink" title={`${repoKey(file)}/${file.path}`}>
          {file.path}
        </p>
        <p className="flex items-center gap-1 text-xs text-ink-3">
          <span className="truncate">{repoKey(file)}</span>
          <span aria-hidden>·</span>
          <Icon.Branch className="h-3 w-3 shrink-0" />
          <span className="truncate">{file.branch}</span>
        </p>
        <p className={cx("flex items-center gap-1.5 pt-1.5 text-xs", line.tone)} title={line.title ?? line.text}>
          {line.icon}
          <span className="min-w-0 truncate">
            {line.text}
            {line.detail && <span className="text-ink-3"> · {line.detail}</span>}
          </span>
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- Publish dialog */

export function PublishDialog({
  sync,
  onClose,
  onPublished,
}: {
  sync: RepoSync;
  onClose: () => void;
  onPublished: (r: PublishResult) => void;
}) {
  const { file, status } = sync;
  const diff = status?.kind === "draft" ? status.diff : null;
  const suggested = file ? (diff ? publishTitle(diff, file.path) : `Add ${file.path}`) : "";
  const [message, setMessage] = useState(suggested);
  const [mode, setMode] = useState<"pr" | "commit">("pr");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<PublishResult | null>(null);

  if (!file) return null;

  const current = parse(sync.source).doc;
  const previous = file.base ? parse(file.base.source).doc : null;
  const itemLabel = (path: string) => {
    const segs = path.split(".");
    const node = findItem(current, segs) ?? (previous ? findItem(previous, segs) : undefined);
    return node?.name && node.name !== node.id ? `${node.name} (${path})` : path;
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await sync.publish(mode, message.trim() || suggested);
      setDone(r);
      onPublished(r);
    } catch (e) {
      setError(describeGitHubError(e));
    } finally {
      setBusy(false);
    }
  };

  const rows = diff
    ? [
        ...(diff.title ? [{ key: "title", tone: "warn" as const, mark: "~", text: `Title → "${diff.title.to}"` }] : []),
        // A component turned into a plane is removed under the same path the plane is added at.
        ...[...diff.components, ...diff.planes.map((p) => ({ ...p, isPlane: true }))].map((c) => ({
          key: `${"isPlane" in c ? "plane" : "component"}:${c.path}`,
          tone: c.kind === "added" ? ("accent" as const) : c.kind === "removed" ? ("danger" as const) : ("warn" as const),
          mark: c.kind === "added" ? "+" : c.kind === "removed" ? "−" : "~",
          text: `${"isPlane" in c ? "Plane " : ""}${itemLabel(c.path)}${c.kind === "changed" ? ` · ${c.fields?.map((f) => FIELD_LABEL[f] ?? f).join(", ")}` : ""}`,
        })),
        ...diff.connections.map((c) => ({
          key: c.key,
          tone: c.kind === "added" ? ("accent" as const) : c.kind === "removed" ? ("danger" as const) : ("warn" as const),
          mark: c.kind === "added" ? "+" : c.kind === "removed" ? "−" : "~",
          text: `${c.connection.source.join(".")} ${c.connection.arrow} ${c.connection.target.join(".")}`,
        })),
      ]
    : [];

  return (
    <Dialog open onClose={onClose} title={done ? "Published" : "Publish to GitHub"} width={520}>
      {done ? (
        <div>
          <p className="text-sm text-ink-2">
            {done.mode === "pr"
              ? done.updated
                ? `Added a commit to pull request #${done.number}. When it merges, the canvas marks the changes as published.`
                : `Opened pull request #${done.number}. When it merges, the canvas marks the changes as published.`
              : `Committed to ${file.branch}. The file and the canvas are in sync.`}
          </p>
          <div className="flex justify-end gap-1.5 pt-4">
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
            <Button variant="primary" icon={<Icon.External />} onClick={() => window.open(done.url, "_blank")}>
              {done.mode === "pr" ? `View pull request #${done.number}` : "View commit"}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <p className="flex items-center gap-1.5 text-sm text-ink-2">
            <GitHubMark className="h-3.5 w-3.5 shrink-0" />
            <span className="mono truncate text-xs text-ink">
              {repoKey(file)}/{file.path}
            </span>
            <span className="shrink-0 text-xs text-ink-3">on {file.branch}</span>
          </p>
          <div className="mt-3 max-h-[180px] overflow-y-auto rounded-md border border-line">
            {status?.kind === "new" ? (
              <p className="px-3 py-2.5 text-sm text-ink-2">Creates the file with the whole architecture.</p>
            ) : rows.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-ink-3">No architectural changes.</p>
            ) : (
              <ul>
                {rows.map((r) => (
                  <li key={r.key} className="flex items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0">
                    <Chip tone={r.tone} className="w-5 justify-center">
                      {r.mark}
                    </Chip>
                    <span className="mono min-w-0 truncate text-xs text-ink">{r.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {status?.kind === "draft" && (
            <p className="pt-1.5 text-xs text-ink-3">
              {describeChanges(status.summary)}. Canvas positions stay in Archer; the file only holds the
              architecture.
            </p>
          )}

          <label className="block pt-3 text-sm text-ink-2">
            Message
            <Input value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1 w-full" maxLength={200} />
          </label>
          <div className="pt-3">
            <Segmented<"pr" | "commit">
              value={mode}
              onChange={setMode}
              options={[
                { value: "pr", label: file.pr ? `Update PR #${file.pr.number}` : "Open a pull request" },
                { value: "commit", label: `Commit to ${file.branch}` },
              ]}
            />
            <p className="pt-1.5 text-xs text-ink-3">
              {mode === "pr"
                ? file.pr
                  ? `Adds a commit to the open pull request #${file.pr.number}.`
                  : "Review and merge it on GitHub, like any other change. Agents' checks (archer check) run on it too."
                : `Writes straight to ${file.branch}. Needs push access to the repository.`}
            </p>
          </div>
          {error && <p className="pt-3 text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-1.5 pt-4">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" icon={<GitHubMark className="h-3.5 w-3.5" />} onClick={() => void run()} disabled={busy}>
              {busy ? "Publishing…" : mode === "pr" ? (file.pr ? "Update pull request" : "Open pull request") : "Commit"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ---------------------------------------------------------- Stop syncing */

export function StopSyncingDialog({
  file,
  documentId,
  workspaceId,
  onClose,
}: {
  file: StoredFile;
  documentId: Id<"documents">;
  workspaceId: string;
  onClose: () => void;
}) {
  const unlink = useMutation(api.repoSync.unlink);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onClose={onClose} title={`Stop syncing ${file.path}?`} width={440}>
      <p className="text-sm text-ink-2">
        The document stays exactly as it is and is stored in Archer again. The file in{" "}
        <span className="mono text-ink">{repoKey(file)}</span> isn&apos;t changed or deleted, and{" "}
        {repoKey(file)} stays linked for the commit timeline.
      </p>
      <div className="flex justify-end gap-1.5 pt-4">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void unlink({ id: documentId, workspaceId }).finally(onClose);
          }}
        >
          Stop syncing
        </Button>
      </div>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- Banners */

/** The file changed on the branch in ways that conflict with the draft. */
export function ConflictBanner({
  file,
  onReview,
  onResolve,
  busy,
}: {
  file: StoredFile;
  onReview: () => void;
  onResolve: (keep: "draft" | "repo") => void;
  busy: boolean;
}) {
  const incoming = file.incoming;
  if (!incoming) return null;
  return (
    <div className="pointer-events-auto flex min-h-9 max-w-full flex-wrap items-center gap-2 rounded-lg border border-line bg-surface py-1 pl-2 pr-1.5 shadow-md">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
        <Icon.Alert className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 text-sm text-ink" title={incoming.conflicts.join("\n")}>
        <span className="font-medium">{incoming.author ?? "Someone"}</span> changed{" "}
        <span className="mono text-xs">{file.path}</span> on {file.branch}
        <span className="text-ink-3">
          {" "}·{" "}
          {incoming.conflicts.length === 1
            ? `conflicts with your draft on ${incoming.conflicts[0]!.split(": ")[0]}`
            : `conflicts with your draft in ${incoming.conflicts.length} places`}
        </span>
      </span>
      <span className="mx-1 h-4 w-px bg-line" />
      <Button size="sm" variant="secondary" onClick={onReview} disabled={busy}>
        Review
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onResolve("draft")} disabled={busy}>
        Keep mine
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onResolve("repo")} disabled={busy}>
        Keep theirs
      </Button>
    </div>
  );
}

/** The file on the branch can't be used (errors, deleted). */
export function ProblemBanner({ file }: { file: StoredFile }) {
  const [hidden, setHidden] = useState<string | null>(null);
  if (!file.problem || hidden === file.problem.message) return null;
  return (
    <div className="pointer-events-auto flex min-h-9 max-w-full items-center gap-2 rounded-lg border border-line bg-surface py-1 pl-2 pr-1.5 shadow-md">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn">
        <Icon.Warning className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 text-sm text-ink">{file.problem.message}</span>
      <IconButton label="Hide" size="sm" onClick={() => setHidden(file.problem!.message)}>
        <Icon.Close />
      </IconButton>
    </div>
  );
}
