import type { CSSProperties, ReactNode } from "react";
import { CATALOG, GLYPHS, GLYPH_VIEWBOX, lookupType } from "@archer/catalog";
import { displayColor } from "@/lib/useIsDark";
import { SITE_URL } from "@/lib/site";
import { Chip, GitHubMark, Icon, cx } from "../ui";
import { highlight } from "./SourcePane";

// Rounded down, so the claim stays true as the catalog grows ("80+").
const TYPE_COUNT = Math.floor(CATALOG.length / 10) * 10;

const PALETTE = [
  "aws.lambda",
  "aws.sqs",
  "aws.s3",
  "kubernetes",
  "postgres",
  "redis",
  "kafka",
  "vercel.nextjs",
  "convex",
  "stripe",
  "clerk",
  "openai",
  "anthropic",
  "agent",
  "mcp",
];

const SHARE_SLUG = "k3v9x2";

// A payload as the detail panel shows it, and as it reads in the file. Kept valid:
// `table` payloads must parse as a Markdown table.
const USERS = [
  ["id", "uuid"],
  ["email", "text"],
  ["created_at", "timestamptz"],
];
const PAYLOAD_SOURCE = `component db "Postgres" @supabase.postgres {
  users table \`\`\`
  | column     | type        |
  | ---------- | ----------- |
${USERS.map(([c, t]) => `  | ${c!.padEnd(10)} | ${t!.padEnd(11)} |`).join("\n")}
  \`\`\`
}`;

/**
 * A catalog type's glyph on its tinted tile, in the type's color for each
 * scheme (near-black brand colors are lifted for dark mode, as on the canvas).
 * `.landing-type-tile` in landing.css picks the one for the page's theme.
 */
function TypeTile({ tag, size = "md" }: { tag: string; size?: "sm" | "md" }) {
  const entry = lookupType(tag);
  const colors = {
    "--type-light": entry?.color ?? "var(--ink-3)",
    "--type-dark": displayColor(entry?.color, true) ?? "var(--ink-3)",
  } as CSSProperties;
  const px = size === "sm" ? 15 : 17;
  return (
    <span
      className={cx(
        "landing-type-tile flex shrink-0 items-center justify-center rounded-sm",
        size === "sm" ? "size-[26px]" : "size-[30px]",
      )}
      style={colors}
    >
      <svg
        width={px}
        height={px}
        viewBox={GLYPH_VIEWBOX}
        dangerouslySetInnerHTML={{ __html: GLYPHS[entry?.glyph ?? "box"] ?? GLYPHS.box! }}
      />
    </span>
  );
}

function Tile({
  title,
  children,
  visual,
  className,
}: {
  title: string;
  children: ReactNode;
  visual: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-5 bg-bg px-5 py-8 sm:px-10", className)}>
      <div>
        <h3 className="text-lg font-semibold text-ink">{title}</h3>
        <p className="max-w-[56ch] pt-1 text-base text-ink-2">{children}</p>
      </div>
      {/* Illustrations only: the words above carry the meaning. */}
      <div aria-hidden className="mt-auto">
        {visual}
      </div>
    </div>
  );
}

function Palette() {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {PALETTE.map((tag) => (
        <div
          key={tag}
          className="flex h-[70px] flex-col items-center justify-center gap-1.5 rounded-md border border-line bg-surface text-xs text-ink-2"
        >
          <TypeTile tag={tag} />
          {lookupType(tag)?.name}
        </div>
      ))}
      <div className="flex h-[70px] flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-line-2 text-xs text-ink-2">
        <span className="flex size-[30px] items-center justify-center">
          <Icon.Plus className="size-4" />
        </span>
        Your own
      </div>
    </div>
  );
}

/** A component as the canvas draws it; `nested` is the count badge of a component with parts. */
function MiniNode({ tag, label, nested }: { tag: string; label: string; nested?: number }) {
  return (
    <div className="flex h-12 items-center gap-2 rounded-md border border-line-2 bg-surface px-2">
      <TypeTile tag={tag} size="sm" />
      <span className="truncate text-sm font-semibold text-ink">{label}</span>
      {nested !== undefined && (
        <span className="mono ml-auto flex shrink-0 items-center gap-1 rounded-sm bg-surface-3 px-1 text-xs text-ink-2">
          <Icon.Nested className="size-3" />
          {nested}
        </span>
      )}
    </div>
  );
}

function Nesting() {
  return (
    <div>
      <div className="rounded-lg border border-line-2 bg-surface-2">
        <div className="flex h-8 items-center gap-2 border-b border-line px-2.5">
          <svg
            width={16}
            height={16}
            viewBox={GLYPH_VIEWBOX}
            className="text-ink-2"
            dangerouslySetInnerHTML={{ __html: GLYPHS.cloud! }}
          />
          <span className="text-sm font-semibold text-ink">Private network</span>
          <span className="mono text-xs text-ink-3">aws.vpc</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5 p-3">
          <MiniNode tag="kubernetes" label="Jobs" nested={3} />
          <MiniNode tag="aws.rds" label="Orders DB" />
        </div>
      </div>
    </div>
  );
}

const DIFF = [
  { mark: "+", markCls: "text-accent", id: "cache", note: "added" },
  { mark: "~", markCls: "text-warn", id: "api", note: "desc, src" },
  { mark: "−", markCls: "text-danger", id: "legacy_cron", note: "removed" },
];

function History() {
  return (
    <div className="mono border border-line bg-[var(--code-bg)] text-sm">
      {DIFF.map((d) => (
        <div key={d.id} className="flex gap-2.5 border-b border-line px-3 py-2 last:border-b-0">
          <span className={d.markCls}>{d.mark}</span>
          <span className={d.note === "removed" ? "text-ink-3 line-through" : "text-ink"}>{d.id}</span>
          <span className="ml-auto text-ink-3">{d.note}</span>
        </div>
      ))}
    </div>
  );
}

function Share() {
  const host = new URL(SITE_URL).host;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-8 items-center gap-2 border border-line-2 bg-surface pl-2.5 pr-1">
        <span className="mono min-w-0 flex-1 truncate text-sm text-ink-2">
          {host}/share/{SHARE_SLUG}
        </span>
        <span className="cursor-default border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink shadow-sm">
          Copy
        </span>
      </div>
      <div className="mono truncate border border-line bg-[var(--code-bg)] px-2.5 py-2 text-sm text-ink-2">
        ![Architecture](…/{SHARE_SLUG}/<span className="text-[var(--tok-string)]">image.svg</span>)
      </div>
    </div>
  );
}

const COMMITS = [
  ["4f1c2a9", "Add Redis cache layer"],
  ["b83e011", "Move checkout into Billing"],
];

function Repo() {
  return (
    <div className="border border-line bg-surface text-sm">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <GitHubMark className="size-3.5 text-ink-2" />
        <span className="font-semibold text-ink">acme/platform</span>
        <span className="mono text-xs text-ink-3">main</span>
      </div>
      {COMMITS.map(([sha, message]) => (
        <div key={sha} className="flex gap-2.5 border-b border-line px-3 py-1.5 last:border-b-0">
          <span className="mono text-ink-3">{sha}</span>
          <span className="truncate text-ink-2">{message}</span>
        </div>
      ))}
    </div>
  );
}

const MEMBERS = [
  { name: "You", role: "Owner" },
  { name: "maya@acme.dev", role: "Editor" },
  { name: "sam@acme.dev", role: "Viewer" },
];

function Team() {
  return (
    <div className="border border-line bg-surface text-sm">
      {MEMBERS.map((m, i) => (
        <div key={m.name} className="flex items-center gap-2.5 border-b border-line px-3 py-2 last:border-b-0">
          <span
            className={cx(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase",
              i === 0 ? "bg-accent-soft text-accent" : "bg-surface-3 text-ink-2",
            )}
          >
            {m.name[0]}
          </span>
          <span className="truncate text-ink">{m.name}</span>
          <Chip className="ml-auto">{m.role}</Chip>
        </div>
      ))}
    </div>
  );
}

function Payload() {
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="border border-line bg-surface">
        <div className="flex h-9 items-center gap-2 border-b border-line px-3">
          <span className="text-sm font-semibold text-ink">users</span>
          <span className="mono text-xs text-ink-3">table</span>
          <Chip tone="accent" className="ml-auto">
            <Icon.Check className="size-3" />
            Valid
          </Chip>
        </div>
        <table className="mono w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-ink-3">
              <th className="px-3 py-1.5 font-normal">column</th>
              <th className="px-3 py-1.5 font-normal">type</th>
            </tr>
          </thead>
          <tbody>
            {USERS.map(([column, type]) => (
              <tr key={column} className="border-b border-line last:border-b-0">
                <td className="px-3 py-1.5 text-ink">{column}</td>
                <td className="px-3 py-1.5 text-[var(--tok-type)]">{type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <pre className="mono overflow-x-auto border border-line bg-[var(--code-bg)] py-3 text-xs leading-[18px] text-[var(--code-fg)]">
        {PAYLOAD_SOURCE.split("\n").map((line, i) => (
          <span key={i} className="block px-3">
            {highlight(line)}
          </span>
        ))}
      </pre>
    </div>
  );
}

/** What else Archer does, as a ruled grid of tiles under the sandbox. */
export function Features() {
  return (
    <section id="features" className="landing-joints border-b border-line">
      <div className="px-5 pt-16 text-center sm:px-10 sm:pt-20">
        <h2 className="landing-headline text-display-sm text-ink sm:text-display-md">
          Everything your architecture needs
        </h2>
      </div>
      {/* The 1px gaps over a line-colored background draw the rules between tiles. */}
      <div className="mt-12 grid gap-px border-t border-line bg-line md:grid-cols-2 lg:grid-cols-3">
        <Tile title={`${TYPE_COUNT}+ component types`} visual={<Palette />} className="md:col-span-2">
          Agents, LLMs, RAG and MCP servers, AWS, GCP, Azure, Vercel, databases, queues and SaaS,
          each with its own glyph. Missing one? Add a custom type and it shows up in
          everyone&apos;s palette.
        </Tile>
        <Tile title="Planes and nesting" visual={<Nesting />}>
          Lay components out on planes, like a frontend and a backend or a VPC. Any component can
          hold its own parts: double-click to open it, and breadcrumbs lead back out.
        </Tile>
        <Tile title="History with real diffs" visual={<History />}>
          Every revision is kept, human or agent. Diffs list what was added, removed or changed.
          Moving boxes around never counts.
        </Tile>
        <Tile title="Share a live link" visual={<Share />}>
          A read-only link for anyone, and an SVG that stays current, for READMEs and docs.
        </Tile>
        <Tile title="Linked to your repo" visual={<Repo />}>
          Link a GitHub repo and branch. src paths open the code, and commits sit next to
          architecture revisions.
        </Tile>
        <Tile title="Teams and roles" visual={<Team />} className="md:col-span-2 lg:col-span-1">
          Personal and team workspaces with owners, editors and viewers. Invite people by email.
        </Tile>
        <Tile title="Data inside components" visual={<Payload />} className="md:col-span-2">
          Attach a schema, an API contract or notes to any component. JSON, YAML and tables are
          validated as you type, and your agent gets all of it.
        </Tile>
      </div>
    </section>
  );
}
