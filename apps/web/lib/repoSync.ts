/**
 * Repo sync rules shared by the server (lib/server/repoSync.ts) and the
 * editor. A document stored in a repository has three versions of its
 * architecture:
 *
 *   base    the file as Archer last imported or published it (`repo.base`)
 *   draft   the document itself (`documents.source`, with its layout)
 *   head    the file on the branch right now
 *
 * The file only ever holds architecture: canonical form, no layout block.
 * Layout lives in Archer, so moving boxes around never needs a commit.
 * Everything here is pure; see docs/repo-sync.md for the whole model.
 */

import {
  diffDocs,
  format,
  isEmptyDiff,
  mergeDocs,
  parse,
  summarizeDiff,
  type DiffSummary,
  type DocDiff,
  type MergeConflict,
} from "@archer/lang";

/** What the repository file holds for a document: canonical form, layout stripped. */
export const fileSource = (source: string): string => format(parse(source).doc, { stripLayout: true });

/** Whether two sources describe the same architecture (layout, formatting and order aside). */
export const sameArchitecture = (a: string, b: string): boolean =>
  isEmptyDiff(diffDocs(parse(a).doc, parse(b).doc));

/** The architectural changes the draft makes to `base` (layout moves never count). */
export const draftDiff = (base: string, draft: string): DocDiff => diffDocs(parse(base).doc, parse(draft).doc);

export type SyncPlan =
  /** The new file has the architecture Archer already has as base: just move base. */
  | { action: "adopt" }
  /** No draft: the document becomes the new file. */
  | { action: "fast-forward"; source: string }
  /** Draft and file changed different things: the document becomes their merge. */
  | { action: "merge"; source: string }
  /** Both changed the same things: the user decides. */
  | { action: "conflict"; conflicts: string[] };

/** "api: changed desc on both sides", "web -> api: points at a component the other side removed" */
export function conflictLine(c: MergeConflict): string {
  if (c.kind !== "connection") return `${c.path}: ${c.reason}`;
  const [source, arrow, target] = c.path.split("|"); // connectionKey()
  return `${source} ${arrow} ${target}: ${c.reason}`;
}

/**
 * What to do with a newer version of the file (`head`, raw file text) given
 * the document (`draft`, with layout) and the version it was based on
 * (`base`: file source, or null when the document never had one).
 * Returned sources still need the write gate and layout (prepareSource).
 */
export function planSync({ base, draft, head }: { base: string | null; draft: string; head: string }): SyncPlan {
  if (sameArchitecture(head, draft)) return { action: "adopt" }; // e.g. our own pull request merged
  if (base !== null && sameArchitecture(head, base)) return { action: "adopt" }; // only formatting/comments changed
  const baseDoc = base !== null ? parse(base).doc : { ...parse(draft).doc, components: [], connections: [], layout: [] };
  const draftDoc = parse(draft).doc;
  if (base !== null && isEmptyDiff(diffDocs(baseDoc, draftDoc))) return { action: "fast-forward", source: head };
  const merged = mergeDocs(baseDoc, draftDoc, parse(head).doc);
  if (merged.conflicts.length > 0) return { action: "conflict", conflicts: merged.conflicts.map(conflictLine) };
  return { action: "merge", source: format(merged.doc) };
}

/**
 * Settle a conflict: merge draft and head again, giving `prefer`'s side every
 * conflicting item. Changes that didn't conflict are kept from both sides.
 */
export function resolveMerge({
  base,
  draft,
  head,
  prefer,
}: {
  base: string | null;
  draft: string;
  head: string;
  prefer: "draft" | "head";
}): string {
  const draftDoc = parse(draft).doc;
  const headDoc = parse(head).doc;
  const baseDoc = base !== null ? parse(base).doc : { ...draftDoc, components: [], connections: [], layout: [] };
  const merged = prefer === "draft" ? mergeDocs(baseDoc, draftDoc, headDoc) : mergeDocs(baseDoc, headDoc, draftDoc);
  return format(merged.doc);
}

/* ------------------------------------------------------------- Status (UI) */

/** The sync fields of `documents.repo` the editor reads (see convex/schema.ts). */
export interface StoredFile {
  owner: string;
  name: string;
  branch: string;
  path: string;
  base?: { commit: string; blob: string; source: string; at: number };
  pr?: { number: number; url: string; branch: string; openedAt: number };
  incoming?: {
    commit: string;
    blob: string;
    source: string;
    author?: string;
    message?: string;
    url?: string;
    conflicts: string[];
    at: number;
  };
  problem?: { message: string; commit?: string; at: number };
  checkedAt?: number;
}

export type SyncStatus =
  /** Linked, but the file doesn't exist yet: the first publish creates it. */
  | { kind: "new" }
  | { kind: "synced" }
  /** Unpublished changes. */
  | { kind: "draft"; summary: DiffSummary; diff: DocDiff }
  /** The branch changed the same things as the draft. */
  | { kind: "conflict" };

export function syncStatus(file: StoredFile, source: string): SyncStatus {
  if (file.incoming) return { kind: "conflict" };
  if (!file.base) return { kind: "new" };
  const diff = draftDiff(file.base.source, source);
  return isEmptyDiff(diff) ? { kind: "synced" } : { kind: "draft", summary: summarizeDiff(diff), diff };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "2 components added, 1 changed, 1 connection removed" */
export function describeChanges(s: DiffSummary): string {
  const parts: string[] = [];
  if (s.added) parts.push(`${plural(s.added, "component")} added`);
  if (s.removed) parts.push(`${plural(s.removed, "component")} removed`);
  if (s.changed) parts.push(`${plural(s.changed, "component")} changed`);
  const conns: string[] = [];
  if (s.connectionsAdded) conns.push(`${s.connectionsAdded} added`);
  if (s.connectionsRemoved) conns.push(`${s.connectionsRemoved} removed`);
  if (s.connectionsChanged) conns.push(`${s.connectionsChanged} changed`);
  if (conns.length) {
    const n = s.connectionsAdded + s.connectionsRemoved + s.connectionsChanged;
    parts.push(`${n === 1 ? "connection" : "connections"} ${conns.join(", ")}`);
  }
  return parts.length ? parts.join(", ") : "no architectural changes";
}

/** Total number of changed components and connections. */
export const changeCount = (s: DiffSummary): number =>
  s.added + s.removed + s.changed + s.connectionsAdded + s.connectionsRemoved + s.connectionsChanged;

const FIELD_WORDS: Record<string, string> = { desc: "description", src: "sources", payloads: "payloads", name: "name", type: "type" };

/** Default commit message / pull request title for publishing `diff`. */
export function publishTitle(diff: DocDiff, path: string): string {
  const s = summarizeDiff(diff);
  const only = (kind: "added" | "removed" | "changed") => {
    const list = diff.components.filter((c) => c.kind === kind);
    return list.length > 0 && list.length <= 2 && changeCount(s) === list.length ? list.map((c) => c.path) : null;
  };
  const added = only("added");
  if (added) return `Add ${added.join(" and ")} to ${path}`;
  const removed = only("removed");
  if (removed) return `Remove ${removed.join(" and ")} from ${path}`;
  const changed = diff.components.filter((c) => c.kind === "changed");
  if (changed.length === 1 && changeCount(s) === 1)
    return `Update the ${changed[0]!.fields?.map((f) => FIELD_WORDS[f] ?? f).join(" and ")} of ${changed[0]!.path} in ${path}`;
  if (diff.title && changeCount(s) === 0) return `Rename the architecture to "${diff.title.to}"`;
  return `Update ${path}: ${describeChanges(s)}`;
}

/** Pull request body: the changes, component by component. */
export function publishBody(diff: DocDiff, editorUrl: string): string {
  const lines: string[] = [];
  if (diff.title) lines.push(`- Renamed "${diff.title.from}" → "${diff.title.to}"`);
  for (const c of diff.components)
    lines.push(
      c.kind === "changed"
        ? `- \`${c.path}\`: changed ${c.fields?.join(", ")}`
        : `- \`${c.path}\`: ${c.kind}`,
    );
  for (const c of diff.connections) {
    const conn = c.connection;
    lines.push(`- \`${conn.source.join(".")} ${conn.arrow} ${conn.target.join(".")}\`: ${c.kind}`);
  }
  return [
    "Architecture changes published from Archer.",
    "",
    ...(lines.length ? lines : ["- No architectural changes (formatting only)."]),
    "",
    `Edit it on the canvas: ${editorUrl}`,
  ].join("\n");
}
