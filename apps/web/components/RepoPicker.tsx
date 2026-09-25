"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import {
  describeGitHubError,
  fetchBranches,
  fetchRepos,
  type GitHubBranch,
  type GitHubRepo,
} from "@/lib/github";
import { Button, Chip, Icon, Input, cx, inputCls, relativeTime } from "./ui";

export interface RepoChoice {
  repo: GitHubRepo;
  branch: string;
}

/**
 * Send the user through GitHub's consent screen again, asking for `repo`.
 * Existing tokens keep the scopes they were issued with, so adding the scope
 * in Clerk alone doesn't reveal private repos (or allow publishing to them).
 */
export function useGrantRepoAccess() {
  const { user } = useUser();
  const [granting, setGranting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const grant = async () => {
    if (!user) return;
    setGranting(true);
    setError(null);
    try {
      const redirectUrl = window.location.href;
      const existing = user.externalAccounts.find((a) => a.provider === "github");
      const account = existing
        ? await existing.reauthorize({ additionalScopes: ["repo"], redirectUrl })
        : await user.createExternalAccount({
            strategy: "oauth_github",
            additionalScopes: ["repo"],
            redirectUrl,
          });
      const url = account.verification?.externalVerificationRedirectURL;
      if (!url) throw new Error("Clerk didn't return a GitHub authorization URL.");
      window.location.href = url.href;
    } catch (e) {
      setGranting(false);
      setError(e instanceof Error ? e.message : "Couldn't start GitHub authorization.");
    }
  };
  return { grant, granting, error, ready: !!user };
}

/**
 * Search the user's GitHub repositories (or type any public owner/name) and
 * pick a branch. Used by every dialog that points a document at a repository.
 * Reports the choice through `onChange` (null until a repo and branch are set).
 */
export function RepoPicker({
  initialRepo,
  initialBranch,
  onChange,
}: {
  /** owner/name to start from (pre-selected when found). */
  initialRepo?: string;
  initialBranch?: string;
  onChange: (choice: RepoChoice | null) => void;
}) {
  const [query, setQuery] = useState(initialRepo ?? "");
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [hasToken, setHasToken] = useState(true);
  const [privateAccess, setPrivateAccess] = useState<boolean | null>(null);
  const access = useGrantRepoAccess();
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<GitHubRepo | null>(null);
  const [branches, setBranches] = useState<GitHubBranch[]>([]);
  const [branch, setBranch] = useState(initialBranch ?? "");
  const [branchError, setBranchError] = useState<string | null>(null);
  const inflight = useRef(0);
  const report = useRef(onChange);
  report.current = onChange;

  // Debounced repo search.
  useEffect(() => {
    const id = ++inflight.current;
    setSearching(true);
    const t = setTimeout(() => {
      fetchRepos(query)
        .then(({ repos, hasToken, privateAccess }) => {
          if (id !== inflight.current) return;
          setRepos(repos);
          setHasToken(hasToken);
          setPrivateAccess(privateAccess);
          setSearchError(null);
          // Pre-select the initial repository when it shows up.
          if (initialRepo && !selected) {
            const match = repos.find((r) => r.fullName.toLowerCase() === initialRepo.toLowerCase());
            if (match) setSelected(match);
          }
        })
        .catch((e: unknown) => {
          if (id !== inflight.current) return;
          setRepos([]);
          setSearchError(describeGitHubError(e));
        })
        .finally(() => {
          if (id === inflight.current) setSearching(false);
        });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Branches for the selected repo.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setBranches([]);
    setBranchError(null);
    fetchBranches(selected.fullName)
      .then(({ branches }) => {
        if (cancelled) return;
        setBranches(branches);
        setBranch((b) => {
          const keep = b !== "" && branches.some((x) => x.name === b) ? b : selected.defaultBranch;
          return branches.some((x) => x.name === keep) ? keep : (branches[0]?.name ?? keep);
        });
      })
      .catch((e: unknown) => {
        if (!cancelled) setBranchError(describeGitHubError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    report.current(selected && branch.trim() !== "" ? { repo: selected, branch: branch.trim() } : null);
  }, [selected, branch]);

  return (
    <div>
      <div className="relative">
        <Icon.Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="Search your repositories or type owner/name"
          className="pl-8"
        />
      </div>
      {!hasToken && (
        <p className="pt-1.5 text-xs text-ink-3">
          Sign-in didn&apos;t include a GitHub token — type the{" "}
          <span className="mono">owner/name</span> of a public repository.
        </p>
      )}
      {hasToken && privateAccess === false && (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2">
          <p className="min-w-0 flex-1 text-xs text-ink-2">
            Private repositories are hidden — GitHub access was granted without the{" "}
            <span className="mono">repo</span> scope.
            {access.error && <span className="block pt-0.5 text-danger">{access.error}</span>}
          </p>
          <Button size="sm" onClick={() => void access.grant()} disabled={access.granting || !access.ready}>
            {access.granting ? "Redirecting…" : "Grant access"}
          </Button>
        </div>
      )}
      <div className="mt-2 max-h-[200px] overflow-y-auto rounded-md border border-line">
        {searchError ? (
          <p className="px-3 py-4 text-sm text-danger">{searchError}</p>
        ) : repos.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-ink-3">
            {searching ? "Searching…" : query.trim() === "" ? "No repositories found." : "No matches."}
          </p>
        ) : (
          <ul>
            {repos.map((r) => {
              const active = selected?.fullName === r.fullName;
              return (
                <li key={r.fullName}>
                  <button
                    type="button"
                    onClick={() => setSelected(r)}
                    className={cx(
                      "flex w-full items-start gap-2 border-b border-line px-3 py-2 text-left transition-colors duration-100 last:border-b-0",
                      active ? "bg-accent-soft" : "hover:bg-surface-2",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-ink">{r.fullName}</span>
                        {r.private && <Chip>private</Chip>}
                      </span>
                      {r.description && (
                        <span className="block truncate text-xs text-ink-2">{r.description}</span>
                      )}
                    </span>
                    {r.pushedAt && (
                      <span className="shrink-0 pt-0.5 text-xs text-ink-3">
                        {relativeTime(new Date(r.pushedAt).getTime())}
                      </span>
                    )}
                    {active && <Icon.Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {selected && (
        <div className="grid grid-cols-[88px_1fr] items-center gap-x-3 pt-3">
          <span className="text-sm text-ink-2">Branch</span>
          <div>
            <select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              className={cx(inputCls, "h-7 pr-7")}
              disabled={branches.length === 0}
            >
              {branches.length === 0 && <option value={branch}>{branch || "Loading…"}</option>}
              {branches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
            {branchError && <p className="pt-1 text-xs text-danger">{branchError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
