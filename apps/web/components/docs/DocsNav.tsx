import Link from "next/link";

const PAGES = [
  { key: "reference", href: "/language", label: "Language reference" },
  { key: "examples", href: "/language/examples", label: "Examples" },
  { key: "mcp", href: "/docs/mcp", label: "MCP server" },
  { key: "cli", href: "/docs/cli", label: "CLI" },
] as const;

const agentLink =
  "mono rounded-sm text-sm text-ink-3 transition-colors duration-100 hover:text-ink";

/**
 * The docs pages' header row: section name and the page tabs, then the docs
 * for agents: the index (/llms.txt) and this page as markdown. Plain links,
 * since they aren't pages.
 */
export function DocsNav({ active }: { active: (typeof PAGES)[number]["key"] }) {
  const current = PAGES.find((p) => p.key === active)!;
  return (
    <nav className="landing-joints flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-5 py-5 sm:px-10">
      <span className="mono text-sm text-ink-3">Docs</span>
      {PAGES.map((p) => (
        <Link
          key={p.key}
          href={p.href}
          aria-current={p.key === active ? "page" : undefined}
          className={`mono rounded-sm text-sm transition-colors duration-100 ${
            p.key === active
              ? "text-ink underline decoration-line-2 underline-offset-[6px]"
              : "text-ink-2 hover:text-ink"
          }`}
        >
          {p.label}
        </Link>
      ))}
      <span className="ml-auto flex items-center gap-x-5">
        <a href="/llms.txt" className={agentLink} title="The docs for agents: an index of every page's markdown">
          llms.txt
        </a>
        <a href={`${current.href}.md`} className={agentLink} title="This page as markdown, for agents">
          View as Markdown
        </a>
      </span>
    </nav>
  );
}
