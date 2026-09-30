"use client";

import Link from "next/link";
import { useMemo } from "react";
import { componentPaths, parse } from "@archer/lang";
import { displayName, type AdminUser } from "@/lib/adminMetrics";
import { DocPreview } from "@/lib/preview";
import { LogoProvider } from "../logos";
import { Chip, GitHubMark, Icon, buttonCls, relativeTime } from "../ui";
import { ADMIN_BASE, Panel } from "./AdminChrome";
import { Stat } from "./Charts";
import { UserCell, canvasHref, date, dateTime } from "./common";

export interface DocumentDetailData {
  _id: string;
  createdAt: number;
  workspaceId: string;
  workspace: { name: string; ownerId: string } | null;
  title: string;
  source: string;
  updatedAt: number;
  shared: boolean;
  repo: { owner: string; name: string; branch: string; path?: string } | null;
  revisions: {
    _id: string;
    createdAt: number;
    author: { kind: "user" | "agent" | "git"; name?: string };
    summary: string | null;
    commit: { sha: string; url: string } | null;
  }[];
  drift: { reportedAt: number; findings: number } | null;
}

/** One document: a preview, who owns it, and its whole history with a read-only view of each version. */
export function DocumentDetail({ doc, owner }: { doc: DocumentDetailData; owner: AdminUser | null }) {
  const components = useMemo(() => {
    try {
      return componentPaths(parse(doc.source).doc).size;
    } catch {
      return null;
    }
  }, [doc.source]);
  const byKind = { user: 0, agent: 0, git: 0 };
  for (const r of doc.revisions) byKind[r.author.kind]++;
  const agents = [...new Set(doc.revisions.flatMap((r) => (r.author.kind === "agent" && r.author.name ? [r.author.name] : [])))];

  return (
    <div className="flex flex-col gap-5">
      <Link href={`${ADMIN_BASE}/documents`} className="flex w-fit items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <Icon.ChevronLeft className="h-3.5 w-3.5" /> Documents
      </Link>
      <section className="grid gap-5 rounded-lg border border-line bg-surface p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Link
          href={canvasHref(doc._id)}
          className="group relative block aspect-[16/9] overflow-hidden rounded-md border border-line bg-ground p-4"
        >
          <LogoProvider>
            <DocPreview source={doc.source} />
          </LogoProvider>
          <span className={`${buttonCls("primary", "sm")} absolute bottom-3 right-3 opacity-90 group-hover:opacity-100`}>
            <Icon.Diagram className="h-3.5 w-3.5" /> Open read-only canvas
          </span>
        </Link>
        <div className="flex min-w-0 flex-col gap-3">
          <h1 className="font-display text-xl text-ink">{doc.title}</h1>
          <div className="flex flex-wrap gap-1.5">
            <Chip>View only</Chip>
            {doc.shared && <Chip tone="accent">Public link on</Chip>}
            {doc.workspace ? <Chip>Team: {doc.workspace.name}</Chip> : <Chip>Personal workspace</Chip>}
            {doc.drift && doc.drift.findings > 0 && <Chip tone="warn">{doc.drift.findings} drift findings</Chip>}
          </div>
          <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-y-2 text-sm">
            <dt className="text-ink-3">Owner</dt>
            <dd className="min-w-0">{owner ? <UserCell user={owner} /> : <span className="text-ink-3">Unknown</span>}</dd>
            <dt className="text-ink-3">Created</dt>
            <dd className="text-ink">{date(doc.createdAt)}</dd>
            <dt className="text-ink-3">Updated</dt>
            <dd className="text-ink">{relativeTime(doc.updatedAt)}</dd>
            {doc.repo && (
              <>
                <dt className="text-ink-3">Repository</dt>
                <dd className="flex min-w-0 items-center gap-1 text-ink">
                  <GitHubMark className="h-3.5 w-3.5 shrink-0" />
                  <a
                    className="truncate hover:underline"
                    href={`https://github.com/${doc.repo.owner}/${doc.repo.name}/tree/${doc.repo.branch}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {doc.repo.owner}/{doc.repo.name}@{doc.repo.branch}
                    {doc.repo.path ? `/${doc.repo.path}` : ""}
                  </a>
                </dd>
              </>
            )}
            <dt className="text-ink-3">Id</dt>
            <dd className="mono truncate text-xs text-ink-2">{doc._id}</dd>
          </dl>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line lg:grid-cols-4">
        <Stat label="Components" value={components ?? "—"} sub={`${doc.source.split("\n").length} lines of .arch`} />
        <Stat label="Versions" value={doc.revisions.length} sub={doc.revisions.length === 500 ? "the latest 500" : "all time"} />
        <Stat label="Edits by people" value={byKind.user} sub={`${byKind.git} from commits`} />
        <Stat label="Edits by agents" value={byKind.agent} sub={agents.length ? agents.join(", ") : "none"} />
      </div>

      <Panel title="History" action="open any version read-only" flush>
        {doc.revisions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-3">No saved versions.</p>
        ) : (
          <ol className="divide-y divide-line">
            {doc.revisions.map((r, i) => (
              <li key={r._id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-ink-3 [&_svg]:h-4 [&_svg]:w-4">
                  {r.author.kind === "agent" ? <Icon.Bot /> : r.author.kind === "git" ? <Icon.Branch /> : <Icon.Pencil />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm text-ink">
                    {r.author.kind === "agent" ? (
                      <Chip tone="accent">{r.author.name ?? "Agent"}</Chip>
                    ) : r.author.kind === "git" ? (
                      <span>Commit{r.author.name ? ` by ${r.author.name}` : ""}</span>
                    ) : (
                      <span>{owner && !doc.workspace ? displayName(owner) : "A member"}</span>
                    )}
                    {i === 0 && <Chip>Current</Chip>}
                    {r.commit && (
                      <a href={r.commit.url} target="_blank" rel="noreferrer" className="mono text-xs text-ink-3 hover:underline">
                        {r.commit.sha.slice(0, 7)}
                      </a>
                    )}
                  </div>
                  {r.summary && <div className="truncate text-xs text-ink-3">{r.summary}</div>}
                </div>
                <time className="whitespace-nowrap text-xs text-ink-3" title={dateTime(r.createdAt)}>
                  {relativeTime(r.createdAt)}
                </time>
                <Link href={canvasHref(doc._id, r._id)} className="whitespace-nowrap text-xs font-medium text-ink-2 hover:text-ink">
                  View
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
