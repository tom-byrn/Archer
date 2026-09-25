"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GitHubClientError,
  createFromGitHub,
  describeGitHubError,
  fetchArchFiles,
  moveToGitHub,
  type FileTarget,
} from "@/lib/github";
import { RepoPicker, type RepoChoice } from "./RepoPicker";
import { Button, Dialog, GitHubMark, Icon, Input, cx } from "./ui";

const DEFAULT_PATH = "architecture.arch";
const SUGGESTED_PATHS = [DEFAULT_PATH, "docs/architecture.arch", "architecture/system.arch"];

type Pick = { kind: "existing"; path: string } | { kind: "new" };

/**
 * Store a document in a `.arch` file in a GitHub repository.
 *
 * - "create" (the dashboard's From GitHub): a new document, imported from an
 *   existing file or blank until its first publish creates the file.
 * - "move" (the editor's Move to GitHub): the open document from now on; an
 *   existing file is replaced by its next publish.
 *
 * Either way the file on the branch becomes the source of truth: see
 * docs/repo-sync.md.
 */
export function GitHubFileDialog({
  mode,
  workspaceId,
  documentId,
  initialRepo,
  onClose,
  onDone,
}: {
  mode: "create" | "move";
  workspaceId: string;
  /** Required for "move". */
  documentId?: string;
  /** owner/name to start from, e.g. the repository the document already links. */
  initialRepo?: { full: string; branch: string };
  onClose: () => void;
  /** "create": the new document's id. */
  onDone: (result: { id?: string; imported?: boolean; existed?: boolean }) => void;
}) {
  const [choice, setChoice] = useState<RepoChoice | null>(null);
  const [files, setFiles] = useState<{ key: string; paths: string[]; truncated: boolean } | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [newPath, setNewPath] = useState(DEFAULT_PATH);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; errors?: string[] } | null>(null);

  const repoFull = choice?.repo.fullName ?? null;
  const key = repoFull && choice ? `${repoFull}@${choice.branch}` : null;

  // The .arch files already on the chosen branch.
  useEffect(() => {
    if (!key || !repoFull || !choice) return;
    let cancelled = false;
    setFiles(null);
    setFilesError(null);
    setError(null);
    fetchArchFiles(repoFull, choice.branch)
      .then((r) => {
        if (cancelled) return;
        setFiles({ key, ...r });
        // Importing is the point of "create"; a move defaults to a new file.
        setPick(mode === "create" && r.paths[0] ? { kind: "existing", path: r.paths[0] } : { kind: "new" });
        // Suggest a new path that isn't taken.
        setNewPath((p) =>
          r.paths.includes(p) ? (SUGGESTED_PATHS.find((s) => !r.paths.includes(s)) ?? p) : p,
        );
      })
      .catch((e: unknown) => {
        if (!cancelled) setFilesError(describeGitHubError(e));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const existing = files?.key === key ? files.paths : [];
  const cleanNew = newPath.trim().replace(/^\/+/, "");
  const newValid = /^[^\s].*\.arch$/.test(cleanNew) && !cleanNew.split("/").some((s) => s === "" || s === "..");
  // Typing the path of a file that's there picks that file.
  const target: { path: string; exists: boolean } | null = useMemo(() => {
    if (!pick) return null;
    if (pick.kind === "existing") return { path: pick.path, exists: true };
    return newValid ? { path: cleanNew, exists: existing.includes(cleanNew) } : null;
  }, [pick, newValid, cleanNew, existing]);

  const submit = async () => {
    if (!choice || !target) return;
    const file: FileTarget = { repo: choice.repo.fullName, branch: choice.branch, path: target.path };
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") onDone(await createFromGitHub(workspaceId, file));
      else if (documentId) onDone(await moveToGitHub(workspaceId, documentId, file));
    } catch (e) {
      setBusy(false);
      setError({
        message: describeGitHubError(e),
        errors: e instanceof GitHubClientError ? e.details?.errors : undefined,
      });
    }
  };

  const action =
    mode === "create"
      ? target?.exists
        ? `Import ${target.path.split("/").pop()}`
        : "Create document"
      : "Move to GitHub";

  return (
    <Dialog
      open
      onClose={onClose}
      title={mode === "create" ? "New document from GitHub" : "Move to GitHub"}
      width={560}
    >
      <p className="pb-3 text-sm text-ink-2">
        {mode === "create" ? "The document is stored" : "From now on this document is stored"} in a{" "}
        <span className="mono">.arch</span> file in your repository. Agents working in the codebase
        edit that file, and the canvas follows the branch. Your edits here become a draft you publish
        back as a pull request.
      </p>
      <RepoPicker initialRepo={initialRepo?.full} initialBranch={initialRepo?.branch} onChange={setChoice} />

      {choice && (
        <div className="pt-4">
          <div className="eyebrow pb-1.5">File</div>
          {filesError ? (
            <p className="text-sm text-danger">{filesError}</p>
          ) : files?.key !== key ? (
            <p className="animate-pulse text-sm text-ink-3">Looking for .arch files…</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-line">
              {existing.map((path) => {
                const active = pick?.kind === "existing" && pick.path === path;
                return (
                  <button
                    key={path}
                    type="button"
                    onClick={() => setPick({ kind: "existing", path })}
                    className={cx(
                      "flex w-full items-center gap-2 border-b border-line px-3 py-2 text-left transition-colors duration-100",
                      active ? "bg-accent-soft" : "hover:bg-surface-2",
                    )}
                  >
                    <GitHubMark className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                    <span className="mono min-w-0 flex-1 truncate text-sm text-ink">{path}</span>
                    <span className="shrink-0 text-xs text-ink-3">
                      {mode === "create" ? "import" : "replace on publish"}
                    </span>
                    {active && <Icon.Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                  </button>
                );
              })}
              <div
                className={cx(
                  "flex items-center gap-2 px-3 py-2",
                  pick?.kind === "new" ? "bg-accent-soft" : "",
                )}
                onClick={() => setPick({ kind: "new" })}
              >
                <Icon.Plus className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                <span className="shrink-0 text-sm text-ink-2">New file</span>
                <Input
                  value={newPath}
                  onChange={(e) => {
                    setNewPath(e.target.value);
                    setPick({ kind: "new" });
                  }}
                  onFocus={() => setPick({ kind: "new" })}
                  className="mono h-7 min-w-0 flex-1 text-sm"
                  aria-label="Path of the new file"
                  placeholder="docs/architecture.arch"
                />
              </div>
            </div>
          )}
          {files?.key === key && files.truncated && (
            <p className="pt-1.5 text-xs text-ink-3">
              The repository is too large to list every file; type the path if yours isn&apos;t shown.
            </p>
          )}
          {pick?.kind === "new" && !newValid && (
            <p className="pt-1.5 text-xs text-danger">A path inside the repository, ending in .arch.</p>
          )}
          {target && (
            <p className="pt-2 text-xs text-ink-3">
              {mode === "create"
                ? target.exists
                  ? `The document starts as ${target.path} on ${choice.branch}.`
                  : `${target.path} doesn't exist yet: your first publish creates it.`
                : target.exists
                  ? `${target.path} already exists: your first publish replaces it, as a pull request you can review.`
                  : `Your first publish creates ${target.path} on ${choice.branch}.`}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-line bg-danger-soft px-3 py-2 text-sm text-danger">
          <p>{error.message}</p>
          {error.errors && (
            <ul className="mono list-disc pl-4 pt-1 text-xs">
              {error.errors.slice(0, 6).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5 pt-4">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="primary"
          icon={<GitHubMark className="h-3.5 w-3.5" />}
          disabled={!choice || !target || busy}
          onClick={() => void submit()}
        >
          {busy ? (mode === "create" ? "Creating…" : "Moving…") : action}
        </Button>
      </div>
    </Dialog>
  );
}
