"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { compileForAgent, componentPaths, findComponent, format, type PayloadFormat } from "@archer/lang";
import { lookupType } from "@archer/catalog";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { markdown } from "@codemirror/lang-markdown";
import type { Extension } from "@codemirror/state";
import { archLanguage } from "@/lib/archLanguage";
import { githubTreeUrl } from "@/lib/githubApi";
import type { RepoLink } from "@/lib/github";
import { toFlow } from "@/lib/toFlow";
import { deriveDoc } from "@/lib/useArchDoc";
import { displayColor, useIsDark } from "@/lib/useIsDark";
import { ArchCanvas, type CanvasCallbacks } from "./ArchCanvas";
import { CodeEditor } from "./CodeMirror";
import { Glyph } from "./nodes";
import { Button, Chip, Icon, IconButton, Kbd, Menu, Section, SidePanel, cx, relativeTime } from "./ui";

const resolveType = (tag: string) => {
  const entry = lookupType(tag);
  return entry ? { color: entry.color, glyph: entry.glyph } : undefined;
};

const langFor = (f: PayloadFormat): Extension =>
  f === "json" ? json() : f === "yaml" ? yaml() : f === "markdown" ? markdown() : [];

const noop = () => {};

/**
 * Read-only presentation of a document: canvas, optional code pane, and a
 * details panel for the selected component. Used for public share links and
 * for workspace members with the viewer role.
 */
export function DocumentViewer({
  title,
  source,
  updatedAt,
  editHref,
  backHref,
  signedIn,
  repo = null,
}: {
  title: string;
  source: string;
  updatedAt: number;
  /** When set, shows "Open in editor". */
  editHref?: string;
  backHref?: string;
  signedIn: boolean;
  /** Linked repository: shown in the header, turns `src` paths into GitHub links. */
  repo?: RepoLink | null;
}) {
  const isDark = useIsDark();
  const derived = useMemo(() => deriveDoc(source), [source]);
  const [selected, setSelected] = useState<string | null>(null);
  const [focus, setFocus] = useState<string[]>([]);
  const [codeOpen, setCodeOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const archExtensions = useMemo(() => [archLanguage()], []);

  const liveFocus = useMemo(
    () =>
      focus.length > 0 && !componentPaths(derived.doc).has(focus.join(".")) ? [] : focus,
    [focus, derived],
  );
  const selectedPath =
    selected && componentPaths(derived.doc).has(selected) ? selected : null;

  const flow = useMemo(
    () =>
      toFlow(derived.laidOut, {
        focus: liveFocus,
        resolveType,
        isDark,
        marks: (_p, c) => (c.src ? { src: c.src } : undefined),
      }),
    [derived, liveFocus, isDark],
  );

  const callbacks: CanvasCallbacks = useMemo(
    () => ({
      onNodeDragEnd: noop,
      onDrillIn: (path) => {
        const node = findComponent(derived.doc, path.split("."));
        if (node && node.children.length > 0) {
          setFocus(path.split("."));
          setSelected(null);
        }
      },
      onSelectNode: (path) => setSelected(path),
      onSelectEdge: () => setSelected(null),
      onClearSelection: () => setSelected(null),
      onConnect: noop,
      onDeleteNodes: noop,
      onDeleteEdges: noop,
      onDropType: noop,
    }),
    [derived],
  );

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1600);
  }, []);
  const copy = (kind: "code" | "agent") => {
    const text = kind === "agent" ? compileForAgent(derived.doc) : format(derived.doc);
    void navigator.clipboard.writeText(text).then(() =>
      notify(kind === "agent" ? "Copied for agent" : "Copied .arch source"),
    );
  };

  const node = selectedPath ? findComponent(derived.doc, selectedPath.split(".")) : null;

  return (
    <div className="flex h-dvh flex-col overscroll-none bg-bg">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-surface px-2">
        <Link
          href={backHref ?? "/"}
          className="flex h-7 shrink-0 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-surface-2"
        >
          <Icon.ChevronLeft className="h-4 w-4 text-ink-2 md:hidden" />
          <span className="hidden font-display text-[17px] leading-none md:inline">Archer</span>
        </Link>
        <span className="mx-1 hidden h-4 w-px bg-line md:block" />
        <span className="max-w-[38vw] truncate px-1 text-base font-medium text-ink md:max-w-[320px]">{title}</span>
        <Chip className="ml-1">View only</Chip>
        {repo && (
          <a
            href={`https://github.com/${repo.owner}/${repo.name}/tree/${encodeURIComponent(repo.branch)}`}
            target="_blank"
            rel="noreferrer"
            className="mono ml-2 hidden max-w-[260px] truncate text-xs text-ink-3 hover:text-ink hover:underline md:inline"
            title="Linked repository"
          >
            {repo.owner}/{repo.name}
            <span className="opacity-70">@{repo.branch}</span>
          </a>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {toast ? (
            <span className="pr-2 text-xs text-accent-text">{toast}</span>
          ) : (
            <span className="hidden pr-2 text-xs text-ink-3 md:inline">Updated {relativeTime(updatedAt)}</span>
          )}
          <IconButton label={codeOpen ? "Hide code" : "Show code"} onClick={() => setCodeOpen((o) => !o)} active={codeOpen}>
            <Icon.Code />
          </IconButton>
          <Menu
            width={240}
            items={[
              {
                label: "Copy for agent",
                hint: derived.valid ? "Layout stripped, guide prepended" : "Document has validation errors",
                icon: <Icon.Sparkle />,
                disabled: !derived.valid,
                onSelect: () => copy("agent"),
              },
              { label: "Copy .arch source", icon: <Icon.Copy />, onSelect: () => copy("code") },
              "separator",
              { label: "Download PNG", icon: <Icon.Download />, onSelect: () => exportRef.current?.() },
            ]}
            trigger={({ open, toggle }) => (
              <Button size="sm" onClick={toggle} aria-expanded={open} className="pr-2">
                Export
                <Icon.ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </Button>
            )}
          />
          {editHref && (
            <Link
              href={editHref}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-sm font-medium text-ink shadow-sm transition-colors hover:bg-surface-2"
            >
              <Icon.Pencil className="h-3.5 w-3.5" />
              Open in editor
            </Link>
          )}
          {!signedIn && (
            <Link
              href="/sign-in"
              className="inline-flex h-7 items-center rounded-md px-2.5 text-sm font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {codeOpen && (
          <div
            className="absolute inset-0 z-20 flex flex-col border-line md:static md:w-[400px] md:shrink-0 md:border-r"
            style={{ background: "var(--code-bg)" }}
          >
            <div className="flex h-8 shrink-0 items-center border-b border-line px-3">
              <span className="mono text-xs text-ink-3">.arch</span>
              <Chip className="ml-2">read-only</Chip>
            </div>
            <div className="min-h-0 flex-1">
              <CodeEditor value={source} readOnly extensions={archExtensions} className="h-full" />
            </div>
          </div>
        )}
        <main className="relative flex min-w-0 flex-1 flex-col">
          {liveFocus.length > 0 && (
            <nav className="flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap border-b border-line bg-surface px-2 text-sm">
              <button
                type="button"
                onClick={() => setFocus([])}
                className="shrink-0 rounded-sm px-1.5 py-0.5 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                {derived.doc.title}
              </button>
              {liveFocus.map((seg, i) => (
                <span key={i} className="flex shrink-0 items-center gap-0.5">
                  <Icon.ChevronRight className="h-3 w-3 text-ink-3" />
                  <button
                    type="button"
                    onClick={() => setFocus(liveFocus.slice(0, i + 1))}
                    className={cx(
                      "rounded-sm px-1.5 py-0.5 transition-colors hover:bg-surface-2",
                      i === liveFocus.length - 1 ? "font-medium text-ink" : "text-ink-2 hover:text-ink",
                    )}
                  >
                    {seg}
                  </button>
                </span>
              ))}
              <span className="ml-auto hidden items-center gap-1.5 pl-2 text-xs text-ink-3 md:flex">
                <Kbd>esc</Kbd> up a level
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon={<Icon.ChevronLeft />}
                className="ml-auto shrink-0 md:hidden"
                onClick={() => setFocus((f) => f.slice(0, -1))}
              >
                Up
              </Button>
            </nav>
          )}
          <div
            className="min-h-0 flex-1 bg-ground"
            onKeyDown={(e) => {
              if (e.key === "Escape") setFocus((f) => f.slice(0, -1));
            }}
          >
            <ArchCanvas
              key={liveFocus.join(".")}
              nodes={flow.nodes}
              edges={flow.edges}
              title={title}
              callbacks={callbacks}
              isDark={isDark}
              selectedPath={selectedPath}
              exportRef={exportRef}
              readOnly
            />
          </div>
        </main>
        {node && selectedPath && (
          <Details path={selectedPath} node={node} onClose={() => setSelected(null)} repo={repo} />
        )}
      </div>
    </div>
  );
}

function Details({
  path,
  node,
  onClose,
  repo,
}: {
  path: string;
  node: NonNullable<ReturnType<typeof findComponent>>;
  onClose: () => void;
  repo: RepoLink | null;
}) {
  const isDark = useIsDark();
  const entry = lookupType(node.type);
  const accent = displayColor(entry?.color, isDark) ?? "#64748b";
  const isUrl = node.src ? /^https?:\/\//.test(node.src) : false;
  const srcHref = node.src
    ? isUrl
      ? node.src
      : repo
        ? githubTreeUrl(repo.owner, repo.name, repo.branch, node.src)
        : null
    : null;
  return (
    <SidePanel className="md:w-[300px]">
      <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-line px-3">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: `${accent}24` }}
        >
          <Glyph tag={node.type} size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-ink">{node.name ?? node.id}</div>
          <div className="mono truncate text-xs text-ink-3">{path}</div>
        </div>
        <IconButton label="Close" onClick={onClose}>
          <Icon.Close />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="Component">
          <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 py-1 text-sm">
            <dt className="text-ink-2">Type</dt>
            <dd className="min-w-0">
              {node.type ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-ink">{entry?.name ?? node.type}</span>
                  <span className="mono text-xs text-ink-3">@{node.type}</span>
                </span>
              ) : (
                <span className="text-ink-3">untyped</span>
              )}
            </dd>
            {node.desc && (
              <>
                <dt className="text-ink-2">Description</dt>
                <dd className="whitespace-pre-wrap text-ink">{node.desc}</dd>
              </>
            )}
            {node.src && (
              <>
                <dt className="text-ink-2">Source</dt>
                <dd className="min-w-0">
                  {srcHref ? (
                    <a
                      href={srcHref}
                      target="_blank"
                      rel="noreferrer"
                      className="mono inline-flex max-w-full items-center gap-1 truncate text-xs text-accent-text hover:underline"
                    >
                      {node.src}
                      <Icon.External className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="mono break-all text-xs text-ink">{node.src}</span>
                  )}
                </dd>
              </>
            )}
            {node.children.length > 0 && (
              <>
                <dt className="text-ink-2">Contains</dt>
                <dd className="text-ink">{node.children.length} component{node.children.length === 1 ? "" : "s"}</dd>
              </>
            )}
          </dl>
        </Section>
        {node.payloads.length > 0 && (
          <Section title="Payloads">
            <div className="space-y-2 py-1">
              {node.payloads.map((p) => (
                <div key={p.name} className="overflow-hidden rounded-md border border-line">
                  <div className="flex h-7 items-center gap-2 border-b border-line bg-surface-2 px-2">
                    <span className="mono text-sm font-semibold text-ink">{p.name}</span>
                    <Chip className="ml-auto">{p.format}</Chip>
                  </div>
                  <div style={{ maxHeight: 280, overflow: "auto" }}>
                    <CodeEditor value={p.content} readOnly lineNumbers={false} extensions={langFor(p.format)} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </SidePanel>
  );
}
