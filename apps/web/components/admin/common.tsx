"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  displayName,
  formatDuration,
  normalizePath,
  type AdminUser,
  type FeedItem,
  type Metrics,
} from "@/lib/adminMetrics";
import { Chip, GitHubMark, Icon, Input, cx, relativeTime } from "../ui";
import { ADMIN_BASE, Avatar } from "./AdminChrome";

export const userHref = (id: string) => `${ADMIN_BASE}/users/${encodeURIComponent(id)}`;
export const documentHref = (id: string) => `${ADMIN_BASE}/documents/${encodeURIComponent(id)}`;
export const canvasHref = (id: string, rev?: string) =>
  `${ADMIN_BASE}/canvas/${encodeURIComponent(id)}${rev ? `?rev=${encodeURIComponent(rev)}` : ""}`;

/** "Sep 30, 14:05" in the viewer's time zone. */
export const dateTime = (ts: number) =>
  new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
export const date = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/** Users by id, for views that show people next to activity. */
export function useUserIndex(metrics: Pick<Metrics, "users">) {
  return useMemo(() => new Map(metrics.users.map((r) => [r.user.id, r.user])), [metrics.users]);
}

export function UserCell({ user, detail = true }: { user: AdminUser; detail?: boolean }) {
  const name = displayName(user);
  return (
    <Link href={userHref(user.id)} className="group flex min-w-0 items-center gap-2.5">
      <Avatar src={user.imageUrl} name={name} size={detail ? 28 : 20} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink group-hover:underline">{name}</span>
        {detail && (
          <span className="flex items-center gap-1.5 truncate text-xs text-ink-3">
            {user.email ?? user.id}
            {user.github && (
              <span className="flex items-center gap-0.5">
                <GitHubMark className="h-3 w-3" />
                {user.github}
              </span>
            )}
          </span>
        )}
      </span>
    </Link>
  );
}

const Unknown = () => <span className="text-sm text-ink-3">Team workspace</span>;

const FEED_KINDS = [
  { value: "all", label: "All" },
  { value: "signup", label: "Sign-ups" },
  { value: "session", label: "Sessions" },
  { value: "edit", label: "Edits" },
  { value: "document", label: "New documents" },
  { value: "tools", label: "Agent calls" },
] as const;

/** The activity feed: sign-ups, sessions, edits, new documents and bursts of agent tool calls. */
export function Feed({
  items,
  users,
  limit,
  filterable,
  showUser = true,
}: {
  items: FeedItem[];
  users: Map<string, AdminUser>;
  limit?: number;
  filterable?: boolean;
  showUser?: boolean;
}) {
  const [kind, setKind] = useState<string>("all");
  const shown = (kind === "all" ? items : items.filter((i) => i.kind === kind)).slice(0, limit ?? 400);
  return (
    <div>
      {filterable && (
        <div className="flex flex-wrap gap-1 border-b border-line px-4 py-2">
          {FEED_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={kind === k.value}
              onClick={() => setKind(k.value)}
              className={cx(
                "rounded-md px-2 py-0.5 text-sm font-medium",
                kind === k.value ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-2",
              )}
            >
              {k.label}
              <span className="pl-1 text-ink-3">
                {k.value === "all" ? items.length : items.filter((i) => i.kind === k.value).length}
              </span>
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-3">No activity in this window.</p>
      ) : (
        <ol className="divide-y divide-line">
          {shown.map((item, i) => (
            <li key={`${item.kind}-${item.at}-${i}`} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-3 px-4 py-2.5">
              <span className="pt-0.5 text-ink-3 [&_svg]:h-4 [&_svg]:w-4">{feedIcon(item)}</span>
              <div className="min-w-0">
                {showUser && (
                  <div className="pb-0.5">
                    {item.userId ? <UserCell user={users.get(item.userId) ?? fallbackUser(item.userId)} detail={false} /> : <Unknown />}
                  </div>
                )}
                <div className="text-sm text-ink-2">{describe(item)}</div>
              </div>
              <time className="whitespace-nowrap pt-0.5 text-xs text-ink-3" title={dateTime(item.at)}>
                {relativeTime(item.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const fallbackUser = (id: string): AdminUser => ({
  id,
  name: null,
  email: null,
  github: null,
  imageUrl: null,
  createdAt: 0,
  lastSignInAt: null,
  lastActiveAt: null,
  banned: false,
});

function feedIcon(item: FeedItem): ReactNode {
  switch (item.kind) {
    case "signup":
      return <Icon.User />;
    case "session":
      return <Icon.Monitor />;
    case "edit":
      return item.author.kind === "agent" ? <Icon.Bot /> : item.author.kind === "git" ? <Icon.Branch /> : <Icon.Pencil />;
    case "document":
      return <Icon.Plus />;
    case "tools":
      return <Icon.Plug />;
  }
}

function describe(item: FeedItem): ReactNode {
  switch (item.kind) {
    case "signup":
      return "Signed up";
    case "session": {
      const pages = [...new Set(item.paths.map(normalizePath))];
      return (
        <>
          Spent <b className="font-medium text-ink">{formatDuration(item.activeMs)}</b> in the app · {item.pageviews}{" "}
          page{item.pageviews === 1 ? "" : "s"}
          {item.device && <> · {item.device}</>}
          <span className="block truncate text-xs text-ink-3">{pages.slice(0, 6).join("  →  ")}</span>
        </>
      );
    }
    case "edit":
      return (
        <>
          {item.author.kind === "agent" ? (
            <>
              <Chip tone="accent">{item.author.name ?? "Agent"}</Chip> edited{" "}
            </>
          ) : item.author.kind === "git" ? (
            <>A commit{item.author.name ? ` by ${item.author.name}` : ""} updated </>
          ) : (
            "Edited "
          )}
          <Link href={documentHref(item.documentId)} className="font-medium text-ink hover:underline">
            {item.title}
          </Link>
          {item.summary && <span className="block truncate text-xs text-ink-3">{item.summary}</span>}
        </>
      );
    case "document":
      return (
        <>
          Created{" "}
          <Link href={documentHref(item.documentId)} className="font-medium text-ink hover:underline">
            {item.title}
          </Link>
        </>
      );
    case "tools":
      return (
        <>
          <Chip tone="accent">{item.agent}</Chip> made {item.calls} tool call{item.calls === 1 ? "" : "s"}
          {item.errors > 0 && <span className="text-danger"> · {item.errors} failed</span>}
          <span className="block truncate text-xs text-ink-3 mono">{item.tools.join(", ")}</span>
        </>
      );
  }
}

/* ------------------------------------------------------------------ tables */

export interface ColumnDef<T> {
  key: string;
  label: string;
  /** Sort value; columns without one don't sort. */
  sort?: (row: T) => number | string;
  cell: (row: T) => ReactNode;
  align?: "right";
  className?: string;
}

/** A searchable, sortable table (client side: the dashboard's row counts are small). */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  search,
  initialSort,
  empty = "Nothing here yet.",
  placeholder = "Search…",
}: {
  rows: T[];
  columns: ColumnDef<T>[];
  rowKey: (row: T) => string;
  search?: (row: T) => string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  empty?: string;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState(initialSort ?? null);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = needle && search ? rows.filter((r) => search(r).toLowerCase().includes(needle)) : rows;
    const col = sort && columns.find((c) => c.key === sort.key);
    if (col?.sort) {
      const dir = sort!.dir === "asc" ? 1 : -1;
      out = [...out].sort((a, b) => {
        const x = col.sort!(a);
        const y = col.sort!(b);
        return (x < y ? -1 : x > y ? 1 : 0) * dir;
      });
    }
    return out;
  }, [rows, q, sort, columns, search]);

  return (
    <div>
      {search && (
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <Icon.Search className="h-3.5 w-3.5 text-ink-3" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="max-w-xs border-transparent bg-transparent hover:border-transparent"
            aria-label={placeholder}
          />
          <span className="ml-auto text-xs text-ink-3">
            {shown.length} of {rows.length}
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cx(
                      "whitespace-nowrap px-4 py-2 text-xs font-semibold text-ink-3",
                      c.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {c.sort ? (
                      <button
                        type="button"
                        className={cx("inline-flex items-center gap-1 hover:text-ink", active && "text-ink")}
                        onClick={() =>
                          setSort(active ? { key: c.key, dir: sort!.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: "desc" })
                        }
                      >
                        {c.label}
                        {active && (
                          <Icon.ChevronDown className={cx("h-3 w-3", sort!.dir === "asc" && "rotate-180")} />
                        )}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((r) => (
              <tr key={rowKey(r)} className="hover:bg-surface-2/60">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cx("px-4 py-2 align-middle text-ink-2", c.align === "right" && "text-right tabular-nums", c.className)}
                  >
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="px-4 py-6 text-sm text-ink-3">{empty}</p>}
      </div>
    </div>
  );
}

/** "—" for absent values in tables. */
export const dash = (v: ReactNode | null | undefined, when = v !== null && v !== undefined && v !== 0) =>
  when ? v : <span className="text-ink-3">—</span>;
