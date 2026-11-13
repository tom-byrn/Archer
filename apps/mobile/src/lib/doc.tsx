/**
 * The document a screen shows. Every document screen (its diagram, a
 * component, a nested canvas, the code) reads `useDoc()`, whatever the
 * document came from: one stored in a workspace, a public share link, or a
 * worked example. Each route wraps its screen in the matching provider.
 */

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { parse, type ArchDoc, type Diagnostic } from "@archer/lang";
import { EXAMPLES } from "@archer/mcp/examples";
import { analyzeSource, typeTags } from "@archer/mcp/analysis";
import { api, canEdit, type Id, type Role } from "./convex";
import { useWorkspace } from "./workspace";

export type DocKind = "document" | "share" | "example";

export interface RepoInfo {
  owner: string;
  name: string;
  branch: string;
  path?: string;
}

export interface DocValue {
  kind: DocKind;
  status: "loading" | "missing" | "ready";
  /** Route prefix of this document's screens, e.g. `/documents/<id>`. */
  base: string;
  title: string;
  source: string;
  doc: ArchDoc;
  diagnostics: Diagnostic[];
  errors: number;
  warnings: number;
  updatedAt?: number;
  role?: Role;
  /** The viewer may change it (stored documents, editors and owners). */
  editable: boolean;
  documentId?: Id<"documents">;
  workspaceId?: string;
  /** Up to when the viewer has reviewed agent changes (stored documents). */
  seenRevisionAt?: number;
  /** Its public share slug, while "anyone with the link can view" is on. */
  publicSlug?: string;
  repo?: RepoInfo;
  /** Example only: what it teaches. */
  summary?: string;
  /** Save new source (editable documents only); the title follows the header. */
  save?: (source: string, summary?: string) => Promise<void>;
}

const EMPTY_DOC = parse('arch "Untitled" v0.2\n').doc;

const DocContext = createContext<DocValue | null>(null);

/**
 * Hand a screen's document to what renders outside the screen's tree: a
 * navigator header (`headerRight`) isn't inside the route's provider.
 */
export function ProvideDoc({ value, children }: { value: DocValue; children: ReactNode }) {
  return <DocContext.Provider value={value}>{children}</DocContext.Provider>;
}

export function useDoc(): DocValue {
  const v = useContext(DocContext);
  if (!v) throw new Error("useDoc() outside a document provider");
  return v;
}

function useAnalysis(source: string | undefined, customTags: readonly string[] = []) {
  const tags = customTags.join(" ");
  return useMemo(() => {
    if (source === undefined) return null;
    const a = analyzeSource(source, typeTags(tags === "" ? [] : tags.split(" ")));
    return { doc: a.doc, diagnostics: a.diagnostics, errors: a.errors.length, warnings: a.warnings.length };
  }, [source, tags]);
}

const loading = (kind: DocKind, base: string, status: "loading" | "missing" = "loading"): DocValue => ({
  kind,
  status,
  base,
  title: "",
  source: "",
  doc: EMPTY_DOC,
  diagnostics: [],
  errors: 0,
  warnings: 0,
  editable: false,
});

/** A document in the selected workspace. */
export function StoredDocProvider({ id, children }: { id: string; children: ReactNode }) {
  const { workspaceId } = useWorkspace();
  const documentId = id as Id<"documents">;
  const row = useQuery(api.documents.get, workspaceId ? { id: documentId, workspaceId } : "skip");
  const library = useQuery(api.library.list, workspaceId ? { workspaceId } : "skip");
  const update = useMutation(api.documents.updateSource);
  const analysis = useAnalysis(row?.source, library?.map((t) => t.tag));
  const base = `/documents/${id}`;

  const save = useCallback(
    async (source: string, summary?: string) => {
      if (!workspaceId) return;
      const title = parse(source).doc.title || "Untitled";
      await update({ id: documentId, workspaceId, source, title, ...(summary ? { summary } : {}) });
    },
    [update, documentId, workspaceId],
  );

  const value = useMemo<DocValue>(() => {
    if (row === undefined || workspaceId === null) return loading("document", base);
    if (row === null || !analysis) return loading("document", base, "missing");
    const editable = canEdit(row.role);
    return {
      kind: "document",
      status: "ready",
      base,
      title: row.title,
      source: row.source,
      ...analysis,
      updatedAt: row.updatedAt,
      role: row.role,
      editable,
      documentId: row._id,
      workspaceId,
      ...(row.seenRevisionAt !== undefined ? { seenRevisionAt: row.seenRevisionAt } : {}),
      ...(row.publicSlug ? { publicSlug: row.publicSlug } : {}),
      ...(row.repo ? { repo: { owner: row.repo.owner, name: row.repo.name, branch: row.repo.branch, ...(row.repo.path ? { path: row.repo.path } : {}) } } : {}),
      ...(editable ? { save } : {}),
    };
  }, [row, analysis, workspaceId, base, save]);

  return <DocContext.Provider value={value}>{children}</DocContext.Provider>;
}

/** A document shared with "anyone with the link" (no account needed). */
export function SharedDocProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const row = useQuery(api.documents.getPublic, { slug });
  const analysis = useAnalysis(row?.source);
  const base = `/share/${slug}`;
  const value = useMemo<DocValue>(() => {
    if (row === undefined) return loading("share", base);
    if (row === null || !analysis) return loading("share", base, "missing");
    return {
      kind: "share",
      status: "ready",
      base,
      title: row.title,
      source: row.source,
      ...analysis,
      updatedAt: row.updatedAt,
      ...(row.role ? { role: row.role } : {}),
      editable: false,
      documentId: row._id,
      publicSlug: slug,
      ...(row.repo ? { repo: row.repo } : {}),
    };
  }, [row, analysis, base, slug]);
  return <DocContext.Provider value={value}>{children}</DocContext.Provider>;
}

/** One of the language docs' worked examples (`@archer/mcp/examples`): bundled, works offline. */
export function ExampleDocProvider({ slug, children }: { slug: string; children: ReactNode }) {
  const example = EXAMPLES.find((e) => e.slug === slug);
  const analysis = useAnalysis(example?.source);
  const base = `/examples/${slug}`;
  const value = useMemo<DocValue>(() => {
    if (!example || !analysis) return loading("example", base, "missing");
    return {
      kind: "example",
      status: "ready",
      base,
      title: example.title,
      source: example.source,
      ...analysis,
      editable: false,
      summary: example.summary,
    };
  }, [example, analysis, base]);
  return <DocContext.Provider value={value}>{children}</DocContext.Provider>;
}
