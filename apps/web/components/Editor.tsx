"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_PLANE_SIZE,
  addComponent,
  addConnection,
  addPlane,
  autoLayout,
  compileForAgent,
  componentPaths,
  componentToPlane,
  diffDocs,
  duplicateComponents,
  extractFragment,
  findComponent,
  findItem,
  findPlane,
  format,
  freshId,
  groupInPlane,
  insertFragment,
  layoutMap,
  mergeForDiff,
  moveComponent,
  nestInComponent,
  outermostItems,
  parse,
  planePathOf,
  planePaths,
  planeTree,
  relayoutComponents,
  removeComponent,
  removeConnection,
  removePlane,
  reparentComponent,
  resizeComponent,
  scopeAt,
  setComponentMeta,
  setConnectionEndpoints,
  setPlane,
  type ArchDoc,
  type ComponentNode,
  type PlaneNode,
  type Shape,
} from "@archer/lang";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { lookupType } from "@archer/catalog";
import { toFlow } from "@/lib/toFlow";
import { fragmentSize, parseFragment } from "@/lib/clipboard";
import { resolveDropTarget } from "@/lib/dropTarget";
import { deriveDoc, useArchDoc } from "@/lib/useArchDoc";
import type { UserLibrary } from "@/lib/userLibrary";
import { useIsDark } from "@/lib/useIsDark";
import type { Id } from "@/convex/_generated/dataModel";
import { authorLabel, useDocumentActivity } from "@/lib/activity";
import type { NodeMarks } from "@/lib/toFlow";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { repoKey, type RepoLink } from "@/lib/github";
import { AccountMenu } from "./AccountMenu";
import { RepoDialog } from "./RepoDialog";
import { GitHubFileDialog } from "./GitHubFileDialog";
import {
  ConflictBanner,
  ProblemBanner,
  PublishDialog,
  StopSyncingDialog,
  StorageControl,
  outcomeToast,
  useRepoSync,
} from "./RepoSync";
import { ShareDialog } from "./ShareDialog";
import { ActivityPanel, type ActivityTab } from "./ActivityPanel";
import {
  ArchCanvas,
  type CanvasApi,
  type CanvasCallbacks,
  type ContextTarget,
} from "./ArchCanvas";
import { CodePane } from "./CodePane";
import {
  CommandPalette,
  type PaletteCommand,
  type PaletteComponent,
  type PaletteMode,
} from "./CommandPalette";
import {
  DetailPanel,
  connectionKey,
  type MultiSelection,
  type Picker,
  type Selection,
} from "./DetailPanel";
import { FeedbackDialog } from "./FeedbackDialog";
import { LogoProvider } from "./logos";
import { Palette } from "./Palette";
import {
  Button,
  Chip,
  ContextMenu,
  GitHubMark,
  Icon,
  IconButton,
  Input,
  Kbd,
  Menu,
  buttonCls,
  cx,
  relativeTime,
  type MenuItem,
} from "./ui";

/**
 * What the editor has open, which decides what it offers beyond editing.
 * Saving, history, sharing and export all need a stored document, so a
 * sandbox gets the same canvas, code pane, palette and inspector without them.
 */
export type EditorSession =
  | {
      /** A workspace document: autosaved, with history, drift, sharing, export and a repo link. */
      kind: "document";
      id: Id<"documents">;
      workspaceId: string;
      seenRevisionAt?: number;
      /** Share slug when "anyone with the link" is on. */
      publicSlug: string | null;
      /** Linked GitHub repository (commit timeline, src deep links). */
      repo: RepoLink | null;
      persist: (source: string, title: string) => Promise<void> | void;
    }
  | {
      /**
       * An in-memory copy that anyone can open, signed in or not (the docs
       * examples). Nothing is saved, shared or exported, and leaving the page
       * discards every edit.
       */
      kind: "sandbox";
      /** The header's way out, e.g. back to the example on the docs page. */
      back: { href: string; label: string };
    };

/** What the canvas is comparing against, when in diff mode. */
type DiffView =
  | { kind: "revision"; id: Id<"revisions"> }
  /** Everything agents (and commits to the repository) changed since the user last reviewed. */
  | { kind: "sinceSeen" }
  /** The repository's conflicting version of the file, compared with the draft. */
  | { kind: "incoming" }
  | null;

const EMPTY_DOC = (like: ArchDoc): ArchDoc => ({
  ...like,
  components: [],
  planes: [],
  connections: [],
  layout: [],
});

/**
 * Delete components and planes (a plane with everything on it). Something
 * already gone with an earlier one (nested in it, or on it) is skipped.
 */
function deleteItems(doc: ArchDoc, paths: readonly string[]): ArchDoc {
  return outermostItems(doc, paths.map((p) => p.split("."))).reduce(
    (acc, segs) =>
      findComponent(acc, segs)
        ? removeComponent(acc, segs)
        : findPlane(acc, segs)
          ? removePlane(acc, segs)
          : acc,
    doc,
  );
}

/** Every component and plane path in a document. */
const itemPaths = (doc: ArchDoc): Set<string> => new Set([...componentPaths(doc), ...planePaths(doc)]);

/** What's selected on the canvas: component paths and connection keys. */
type Sel = { nodes: string[]; edges: string[] };
const NONE: Sel = { nodes: [], edges: [] };
const only = (path: string): Sel => ({ nodes: [path], edges: [] });

/** Toggle `item` in a list (shift/⌘-click). */
const toggle = (list: string[], item: string): string[] =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

/** Focus in a text field, a textarea or the code editor: keys belong to it. */
const isTyping = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return (
    el.tagName === "TEXTAREA" ||
    el.tagName === "INPUT" ||
    el.isContentEditable ||
    !!el.closest?.(".cm-editor")
  );
};

/** Focus on the canvas or on nothing in particular (not a panel control that uses arrows itself). */
const onCanvas = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  return !el || el === document.body || !!el.closest?.(".react-flow");
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Rewrite a path that moved (or sits inside one that did). */
const remapPath = (p: string, moved: ReadonlyMap<string, string>): string => {
  for (const [from, to] of moved) {
    if (p === from) return to;
    if (p.startsWith(from + ".")) return to + p.slice(from.length);
  }
  return p;
};

/** Arrow keys nudge the selection one grid cell (four with shift). */
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** What shortcuts and clipboard events can do; refreshed on every render. */
interface EditorActions {
  editable: boolean;
  paletteOpen: boolean;
  hasSelection: boolean;
  togglePalette: () => void;
  find: () => void;
  undo: () => void;
  redo: () => void;
  escape: () => void;
  selectAll: () => void;
  duplicate: () => void;
  group: () => void;
  nudge: (dx: number, dy: number) => void;
  /** The selection as `.arch` text, or null when no component is selected. */
  copyText: () => string | null;
  copied: () => void;
  cutDone: () => void;
  paste: (fragment: ArchDoc) => void;
}

/** ⌘ on Mac, Ctrl elsewhere, for shortcut hints. */
const MOD =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";

/** Click-to-edit document title. Commits on blur / Enter, reverts on Escape. */
function TitleField({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Rename document"
        className="h-7 max-w-[38vw] truncate rounded-md px-2 text-base font-medium text-ink transition-colors hover:bg-surface-2 md:max-w-[320px]"
      >
        {value}
      </button>
    );
  }
  return (
    <Input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        setEditing(false);
        const v = draft.trim();
        if (v !== "" && v !== value) onCommit(v);
        else setDraft(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className="w-[38vw] font-medium md:w-[260px]"
    />
  );
}

interface EditorProps {
  initialSource: string;
  /** Custom component types: the workspace's, or in-memory ones in a sandbox. */
  library: UserLibrary;
  session: EditorSession;
}

/** The editor draws catalog types with their product logos (components/logos.tsx). */
export function Editor(props: EditorProps) {
  return (
    <LogoProvider>
      <EditorView {...props} />
    </LogoProvider>
  );
}

function EditorView({ initialSource, library, session }: EditorProps) {
  // Everything that saves, shares or exports checks `stored`; a sandbox has none of it.
  const stored = session.kind === "document" ? session : null;
  const persist = stored?.persist;
  const repo = stored?.repo ?? null;
  const back =
    session.kind === "sandbox" ? session.back : { href: "/", label: "All documents" };
  const { source, setSource, mutate, mutateWith, undo, redo, canUndo, canRedo } =
    useArchDoc(initialSource);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const { isSignedIn } = useAuth();
  const isDark = useIsDark();
  const customTags = useMemo(
    () => new Set(library.items.map((t) => t.tag)),
    [library.items],
  );
  const resolveType = useCallback(
    (tag: string) => {
      const custom = library.items.find((t) => t.tag === tag);
      if (custom) return { color: custom.color, glyph: custom.glyph };
      const entry = lookupType(tag);
      return entry ? { color: entry.color, glyph: entry.glyph } : undefined;
    },
    [library.items],
  );
  const derived = useMemo(() => deriveDoc(source, customTags), [source, customTags]);
  const [sel, setSel] = useState<Sel>(NONE);
  /**
   * What the inspector's form is open on: a component path or connection key.
   * The inspector opens read-only, and selecting anything else goes back to
   * reading.
   */
  const [editingId, setEditingId] = useState<string | null>(null);
  /** "Change shape…" / "Change icon…" / "Change color…": the component whose list the form opens on. */
  const [pickerFor, setPickerFor] = useState<{ path: string; picker: Picker } | null>(null);
  /**
   * A connection picked out (one click) in the inspector's list for the
   * component at `path`: lit there and on the canvas, without leaving the
   * component. A double-click opens the connection instead.
   */
  const [spotlight, setSpotlight] = useState<{ path: string; key: string } | null>(null);
  const [focus, setFocus] = useState<string[]>([]);
  const [codeOpen, setCodeOpen] = useState(false);
  // The component palette (left sidebar) starts closed every time the editor
  // opens, so the canvas gets the whole width until it's asked for.
  const [componentsOpen, setComponentsOpen] = useState(false);
  const [palette, setPalette] = useState<PaletteMode | null>(null);
  const [menu, setMenu] = useState<{ target: ContextTarget; at: { x: number; y: number } } | null>(
    null,
  );
  const [reveal, setReveal] = useState<{ path: string; nonce: number } | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const canvasApi = useRef<CanvasApi | null>(null);
  /** Where "Add component…" from the canvas menu should put the new one. */
  const addAt = useRef<{ x: number; y: number } | null>(null);
  const activity = useDocumentActivity(
    stored?.id ?? null,
    stored?.workspaceId ?? null,
    stored?.seenRevisionAt,
  );
  const [panel, setPanel] = useState<ActivityTab | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [repoOpen, setRepoOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const setRepo = useMutation(api.documents.setRepo);
  const [diffView, setDiffView] = useState<DiffView>(null);

  const toggleCode = useCallback(() => setCodeOpen((open) => !open), []);
  const toggleComponents = useCallback(() => setComponentsOpen((open) => !open), []);

  // The component open on the canvas; one that stopped resolving (deleted,
  // renamed) falls back to the top level.
  const liveFocus = useMemo(
    () =>
      focus.length > 0 && !componentPaths(derived.doc).has(focus.join("."))
        ? []
        : focus,
    [focus, derived],
  );

  // Diff mode: the doc to draw plus per-path/per-connection statuses.
  const diff = useMemo(() => {
    if (!diffView) return null;
    let base: ArchDoc | null = null;
    let next: ArchDoc | null = null;
    if (diffView.kind === "revision") {
      const i = activity.revisions.findIndex((r) => r._id === diffView.id);
      const rev = activity.revisions[i];
      if (!rev) return null;
      next = parse(rev.source).doc;
      const older = activity.revisions[i + 1];
      base = older ? parse(older.source).doc : EMPTY_DOC(next);
    } else if (diffView.kind === "incoming") {
      const incoming = stored?.repo?.incoming;
      if (!incoming) return null;
      // The file has no layout: borrow the draft's so shared components stay put.
      base = derived.doc;
      next = { ...parse(incoming.source).doc, layout: derived.doc.layout };
    } else {
      if (!activity.baseline) return null;
      base = parse(activity.baseline.source).doc;
      next = derived.doc;
    }
    const merged = mergeForDiff(base, next);
    return {
      doc: autoLayout(merged.doc),
      components: merged.components,
      planes: merged.planes,
      connections: merged.connections,
      summary: diffDocs(base, next),
    };
  }, [diffView, activity.revisions, activity.baseline, derived.doc, stored?.repo?.incoming]);

  // Agent and repository edits since the user last reviewed → "touched" badges.
  const touched = useMemo(() => {
    if (activity.unseenRevisions.length === 0 || !activity.baseline) return new Set<string>();
    const d = diffDocs(parse(activity.baseline.source).doc, derived.doc);
    return new Set(
      [...d.components, ...d.planes].filter((c) => c.kind !== "removed").map((c) => c.path),
    );
  }, [activity.unseenRevisions.length, activity.baseline, derived.doc]);

  const marks = useCallback(
    (path: string, item: ComponentNode | PlaneNode): NodeMarks | undefined => {
      const m: NodeMarks = {};
      const d = item.kind === "plane" ? diff?.planes.get(path) : diff?.components.get(path);
      if (d) m.diff = d;
      if (!diff && touched.has(path)) m.touched = true;
      const f = activity.driftByPath.get(path);
      if (f && (f.status === "missing" || f.status === "changed")) m.drift = f.status;
      if (item.kind === "component" && item.src?.length) m.src = item.src;
      return Object.keys(m).length > 0 ? m : undefined;
    },
    [diff, touched, activity.driftByPath],
  );

  const displayDoc = diff ? diff.doc : derived.laidOut;
  const flow = useMemo(
    () =>
      toFlow(displayDoc, {
        focus: liveFocus,
        resolveType,
        isDark,
        marks,
        edgeDiff: diff ? diff.connections : undefined,
      }),
    [displayDoc, liveFocus, resolveType, isDark, marks, diff],
  );

  /** A component's display name, for toasts. */
  const nameOf = useCallback(
    (path: readonly string[]) => {
      const node = findItem(derived.doc, path);
      return node?.name ?? node?.id ?? path.join(".");
    },
    [derived.doc],
  );

  const callbacks: CanvasCallbacks = useMemo(
    () => ({
      onNodesDragEnd: (moves) => {
        const moved = mutateWith((d) => {
          const dragged = moves.map((m) => m.path.split("."));
          // Every landing spot is decided on the doc as it was, before any of them moves.
          const targets = moves.map(({ path, info }) =>
            resolveDropTarget(d, info.center, {
              base: liveFocus,
              exclude: dragged,
              topLeft: info.topLeft,
              sizeGrid: info.sizeGrid,
              nest: findComponent(d, path.split(".")) !== undefined,
            }),
          );
          const renamed = new Map<string, string>();
          let into: string[] | null = null;
          let next = d;
          dragged.forEach((segs, i) => {
            const target = targets[i]!;
            if (target.scope.join(".") === segs.slice(0, -1).join(".")) {
              // On this canvas: onto a plane, off one, or just somewhere else.
              const plane = planePathOf(next, segs);
              const current = plane ? plane[plane.length - 1] : undefined;
              if ((target.plane ?? null) !== (current ?? null))
                next = setPlane(next, segs, target.plane ?? null, target.at);
              else if (target.at) next = moveComponent(next, segs, target.at);
              return;
            }
            // Into the component it was dropped on. Its id stays unless taken there.
            const id = segs[segs.length - 1]!;
            const taken = scopeAt(next, target.scope);
            const clash =
              taken?.components.some((c) => c.id === id) || taken?.planes.some((p) => p.id === id);
            const newId = clash ? freshId(next, target.scope, id) : id;
            next = reparentComponent(next, segs, target.scope, target.at, target.plane);
            renamed.set(segs.join("."), [...target.scope, newId].join("."));
            into = target.scope;
          });
          return { doc: next, value: { renamed, into: into as string[] | null } };
        });
        if (!moved) return;
        if (moved.into) {
          // What went in is out of sight now: select where it went.
          setSel(only(moved.into.join(".")));
          notify(`Moved ${plural(moved.renamed.size, "component")} into ${nameOf(moved.into)}`);
        } else if (moved.renamed.size > 0) {
          setSel((s) => ({ ...s, nodes: s.nodes.map((p) => remapPath(p, moved.renamed)) }));
          setEditingId((id) => id && remapPath(id, moved.renamed));
        }
      },
      onDrillIn: (path) => {
        const segs = path.split(".");
        if (findComponent(derived.doc, segs)) {
          setFocus(segs);
          setSel(NONE);
        }
      },
      onOpenContext: (path) => goTo(path),
      onSelectNode: (path, additive) =>
        setSel((s) => (additive ? { ...s, nodes: toggle(s.nodes, path) } : only(path))),
      onSelectEdge: (index, additive) => {
        const conn = derived.doc.connections[index];
        if (!conn) return;
        const key = connectionKey(conn);
        setSel((s) => (additive ? { ...s, edges: toggle(s.edges, key) } : { nodes: [], edges: [key] }));
      },
      onSelectMany: (paths) => setSel({ nodes: paths, edges: [] }),
      onClearSelection: () => setSel(NONE),
      onConnect: (s, t) => mutate((d) => addConnection(d, s.split("."), t.split("."))),
      onDelete: (paths, indices) => {
        mutate((d) => {
          // Connections first, by index on the unchanged doc; then components and planes.
          const withoutEdges = [...new Set(indices)]
            .sort((a, b) => b - a)
            .reduce((acc, i) => removeConnection(acc, i), d);
          return deleteItems(withoutEdges, paths);
        });
        setSel(NONE);
      },
      onDropType: (tag, pos, shape) => {
        const added = mutateWith((d) => {
          const target = resolveDropTarget(d, pos, { base: liveFocus, nest: true });
          const r = addComponent(d, target.scope, { type: tag, shape, plane: target.plane, at: target.at });
          return { doc: r.doc, value: target.at ? null : target.scope };
        });
        if (added) notify(`Added inside ${nameOf(added)}`);
      },
      onDropPlane: (pos) => {
        const path = mutateWith((d) => {
          const target = resolveDropTarget(d, pos, { base: liveFocus, sizeGrid: EMPTY_PLANE_SIZE });
          const r = addPlane(d, target.scope, { name: "Plane", plane: target.plane, at: target.at });
          return { doc: r.doc, value: r.path.join(".") };
        });
        if (path) selectNew(path);
      },
      dropTargetAt: (point, dragging) =>
        resolveDropTarget(derived.laidOut, point, {
          base: liveFocus,
          exclude: dragging.paths.map((p) => p.split(".")),
          nest: dragging.nest,
        }).highlight ?? null,
      onReconnect: (index, end, path) => {
        const key = mutateWith((d) => {
          const c = d.connections[index];
          if (!c) throw new Error(`No connection at index ${index}.`);
          const segs = path.split(".");
          const next = setConnectionEndpoints(
            d,
            index,
            end === "source" ? segs : c.source,
            end === "target" ? segs : c.target,
          );
          return { doc: next, value: connectionKey(next.connections[index]!) };
        });
        if (key) setSel({ nodes: [], edges: [key] });
      },
      onResize: (path, { at, size }) =>
        mutate((d) => {
          const segs = path.split(".");
          return moveComponent(resizeComponent(d, segs, size), segs, at);
        }),
      onContextMenu: (target, at) => {
        // Right-clicking something outside the selection selects just it.
        if (target.kind === "node")
          setSel((s) => (s.nodes.includes(target.path) ? s : only(target.path)));
        if (target.kind === "edge") {
          const conn = derived.doc.connections[target.index];
          const key = conn && connectionKey(conn);
          if (key) setSel((s) => (s.edges.includes(key) ? s : { nodes: [], edges: [key] }));
        }
        setMenu({ target, at });
      },
    }),
    // goTo, notify and selectNew are recreated each render but only read state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutate, mutateWith, derived, liveFocus, nameOf],
  );

  // What's selected, minus anything that no longer resolves (deleted, renamed,
  // connection edited away). One thing selected opens its inspector.
  const liveSel: Sel = useMemo(() => {
    const paths = itemPaths(derived.doc);
    const keys = new Set(derived.doc.connections.map(connectionKey));
    const nodes = sel.nodes.filter((p) => paths.has(p));
    const edges = sel.edges.filter((k) => keys.has(k));
    return nodes.length === sel.nodes.length && edges.length === sel.edges.length
      ? sel
      : { nodes, edges };
  }, [sel, derived]);
  const liveSelection: Selection =
    liveSel.nodes.length === 1 && liveSel.edges.length === 0
      ? findPlane(derived.doc, liveSel.nodes[0]!.split("."))
        ? { kind: "plane", path: liveSel.nodes[0]! }
        : { kind: "component", path: liveSel.nodes[0]! }
      : liveSel.nodes.length === 0 && liveSel.edges.length === 1
        ? { kind: "connection", key: liveSel.edges[0]! }
        : null;
  const setSelection = useCallback(
    (s: Selection) =>
      setSel(s === null ? NONE : s.kind === "connection" ? { nodes: [], edges: [s.key] } : only(s.path)),
    [],
  );
  const selectedPath = liveSelection && liveSelection.kind !== "connection" ? liveSelection.path : null;
  const selectedId =
    liveSelection === null
      ? null
      : liveSelection.kind === "connection"
        ? liveSelection.key
        : liveSelection.path;
  // Once something else is selected the form stays closed, so coming back reads first.
  useEffect(() => {
    if (editingId !== null && editingId !== selectedId) setEditingId(null);
    if (pickerFor !== null && pickerFor.path !== selectedId) setPickerFor(null);
    if (spotlight !== null && spotlight.path !== selectedId) setSpotlight(null);
  }, [editingId, pickerFor, spotlight, selectedId]);
  const pickerOpened = useCallback(() => setPickerFor(null), []);

  /** Select a component that was just made, its form open to name it. */
  const selectNew = useCallback((path: string) => {
    setSel(only(path));
    setEditingId(path);
  }, []);

  const addFromPalette = useCallback(
    (tag: string | undefined, shape?: Shape) => {
      const point = addAt.current;
      addAt.current = null;
      const path = mutateWith((d) => {
        const target = point ? resolveDropTarget(d, point, { base: liveFocus }) : null;
        const r = target
          ? addComponent(d, target.scope, { type: tag, shape, plane: target.plane, at: target.at })
          : addComponent(d, liveFocus, { type: tag, shape });
        return { doc: r.doc, value: r.path.join(".") };
      });
      if (path) selectNew(path);
    },
    [mutateWith, liveFocus, selectNew],
  );

  /** A new plane, at the point the menu was opened (else wherever there's room), its form open. */
  const addPlaneHere = useCallback(
    (point?: { x: number; y: number }) => {
      const at = point ?? addAt.current;
      addAt.current = null;
      const path = mutateWith((d) => {
        const target = at ? resolveDropTarget(d, at, { base: liveFocus, sizeGrid: EMPTY_PLANE_SIZE }) : null;
        const r = addPlane(d, target?.scope ?? liveFocus, {
          name: "Plane",
          ...(target ? { plane: target.plane, at: target.at } : {}),
        });
        return { doc: r.doc, value: r.path.join(".") };
      });
      if (path) selectNew(path);
    },
    [mutateWith, liveFocus, selectNew],
  );

  // The last text known to be stored. Remote saves (an agent over MCP) arrive
  // as a new `initialSource`; adopt them so the canvas and banners stay live.
  const persisted = useRef(initialSource);
  useEffect(() => {
    if (initialSource === persisted.current) return;
    persisted.current = initialSource;
    setSource(initialSource);
  }, [initialSource, setSource]);

  // Debounced autosave of the source text.
  const titleForSave = derived.doc.title;
  useEffect(() => {
    if (!persist || source === persisted.current) return;
    setSaveState("saving");
    const t = setTimeout(() => {
      const text = source;
      void Promise.resolve(persist(text, titleForSave)).then(() => {
        persisted.current = text;
        setSaveState("saved");
      });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, persist]);

  // Save a pending edit now (before publishing or syncing, so the server sees the screen).
  const latest = useRef(source);
  latest.current = source;
  const flush = useCallback(async () => {
    if (!persist) return;
    const text = latest.current;
    if (text === persisted.current) return;
    await persist(text, parse(text).doc.title);
    persisted.current = text;
    setSaveState("saved");
  }, [persist]);

  const [toast, setToast] = useState<string | null>(null);
  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const repoSync = useRepoSync({
    documentId: stored?.id ?? "",
    workspaceId: stored?.workspaceId ?? "",
    repo: stored ? repo : null,
    source,
    flush,
    onOutcome: (o) => {
      const line = outcomeToast(o, repoSync.file);
      if (line) notify(line);
    },
  });
  const syncFile = repoSync.file;

  // Keyboard shortcuts and the clipboard, dispatched to the latest actions
  // (assigned further down, every render).
  const actions = useRef<EditorActions | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const a = actions.current;
      if (!a) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === "k") {
        e.preventDefault();
        a.togglePalette();
        return;
      }
      if (isTyping(e.target) || a.paletteOpen) return;
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) a.redo();
        else a.undo();
        return;
      }
      if (mod && key === "f") {
        e.preventDefault();
        a.find();
        return;
      }
      if (e.key === "Escape") {
        a.escape();
        return;
      }
      if (!a.editable) return;
      if (mod && key === "a") {
        e.preventDefault();
        a.selectAll();
      } else if (mod && key === "d") {
        e.preventDefault();
        a.duplicate();
      } else if (mod && key === "g") {
        e.preventDefault();
        a.group();
      } else if (!mod && ARROWS[e.key] && a.hasSelection && onCanvas(e.target)) {
        // Capture phase, so this beats React Flow's own arrow-key move (which
        // only moves the node on screen, not in the document).
        e.preventDefault();
        e.stopPropagation();
        const [dx, dy] = ARROWS[e.key]!;
        const step = e.shiftKey ? 4 : 1;
        a.nudge(dx * step, dy * step);
      }
    };
    // Text selected on the page, or focus in a field: the browser's copy wins.
    const textCopy = (e: ClipboardEvent) =>
      isTyping(e.target) || (window.getSelection()?.toString() ?? "") !== "";
    const onCopy = (e: ClipboardEvent) => {
      const a = actions.current;
      if (!a || a.paletteOpen || textCopy(e)) return;
      const text = a.copyText();
      if (text === null) return;
      e.clipboardData?.setData("text/plain", text);
      e.preventDefault();
      if (e.type === "cut" && a.editable) a.cutDone();
      else a.copied();
    };
    const onPaste = (e: ClipboardEvent) => {
      const a = actions.current;
      if (!a || !a.editable || a.paletteOpen || isTyping(e.target)) return;
      const fragment = parseFragment(e.clipboardData?.getData("text/plain") ?? "");
      if (!fragment) return;
      e.preventDefault();
      a.paste(fragment);
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, []);

  const errors = derived.diagnostics.filter((d) => d.severity === "error");
  const warnings = derived.diagnostics.length - errors.length;


  // Sandbox: back to the source it opened with, as one undoable step.
  const edited = source !== initialSource;
  const reset = () => {
    setSource(initialSource);
    setFocus([]);
    setSel(NONE);
  };

  const copyDoc = (kind: "code" | "agent") => {
    const text =
      kind === "agent" ? compileForAgent(derived.doc) : format(derived.doc);
    void navigator.clipboard.writeText(text).then(() =>
      notify(kind === "agent" ? "Copied for agent" : "Copied .arch source"),
    );
  };

  const restore = (text: string) => {
    mutate(() => parse(text).doc);
    setDiffView(null);
  };
  const addFromDrift = (name: string, src?: string) =>
    mutate((d) => {
      const { doc: next, path } = addComponent(d, liveFocus, { name });
      return src ? setComponentMeta(next, path, { src: [src] }) : next;
    });
  const openPanel = (tab: ActivityTab) => {
    setPanel(tab);
    setSel(NONE);
  };

  /* ---- Selection actions (canvas menu, palette, inspector, shortcuts) ---- */

  // Diff mode shows a past or merged doc read-only; nothing edits it.
  const editable = diff === null;
  const editing = editable && selectedId !== null && editingId === selectedId;
  // Lit only while the list it was picked from shows (the form doesn't list connections).
  const spotlit = spotlight !== null && spotlight.path === selectedPath && !editing ? spotlight.key : null;
  const selCount = liveSel.nodes.length;
  const selPaths = () => liveSel.nodes.map((p) => p.split("."));
  /** The selection's planes, if any: they can't be nested in a component. */
  const selHasPlane = liveSel.nodes.some((p) => findPlane(derived.doc, p.split(".")) !== undefined);
  /** Everything on the canvas on screen: its components and planes. */
  const levelPaths = (d: ArchDoc): string[][] => {
    const scope = scopeAt(d, liveFocus);
    if (!scope) return [];
    return [...scope.planes, ...scope.components].map((x) => [...liveFocus, x.id]);
  };
  /** The top of the canvas on screen: what isn't on a plane there. */
  const topPaths = (d: ArchDoc): string[][] => {
    const scope = scopeAt(d, liveFocus);
    return scope ? planeTree(scope).itemsOn(undefined).map((x) => [...liveFocus, x.id]) : [];
  };
  const selectCreated = (paths: string[][] | undefined, verb: string) => {
    if (!paths || paths.length === 0) return;
    setSel({ nodes: paths.map((p) => p.join(".")), edges: [] });
    notify(`${verb} ${plural(paths.length, "item")}`);
  };

  const copyText = () =>
    selCount === 0 ? null : format(extractFragment(derived.laidOut, selPaths()));
  const deleteSelection = () => {
    const paths = liveSel.nodes;
    const keys = liveSel.edges;
    if (paths.length === 0 && keys.length === 0) return;
    mutate((d) => {
      const withoutEdges = keys
        .map((k) => d.connections.findIndex((c) => connectionKey(c) === k))
        .filter((i) => i >= 0)
        .sort((a, b) => b - a)
        .reduce((acc, i) => removeConnection(acc, i), d);
      return deleteItems(withoutEdges, paths);
    });
    setSel(NONE);
  };
  // Menu and palette versions go through the async clipboard API; the keyboard
  // uses copy/cut/paste events instead, which need no permission.
  const copySelection = (cut = false) => {
    const text = copyText();
    if (text === null) return;
    const n = plural(selCount, "item");
    void navigator.clipboard.writeText(text).then(
      () => {
        if (cut) deleteSelection();
        notify(`${cut ? "Cut" : "Copied"} ${n}`);
      },
      () => notify(`Press ${MOD}${cut ? "X" : "C"} to ${cut ? "cut" : "copy"}`),
    );
  };
  const pasteFragment = (fragment: ArchDoc, point?: { x: number; y: number }) => {
    const anchor = point ?? canvasApi.current?.pasteAnchor();
    const created = mutateWith((d) => {
      // Centered on the pointer, on whichever plane is under it.
      const target = anchor
        ? resolveDropTarget(d, anchor, { base: liveFocus, sizeGrid: fragmentSize(fragment) })
        : null;
      const r = insertFragment(d, fragment, target?.scope ?? liveFocus, target?.at, target?.plane);
      return { doc: r.doc, value: r.paths };
    });
    selectCreated(created, "Pasted");
  };
  const pasteFromClipboard = (point?: { x: number; y: number }) =>
    void navigator.clipboard.readText().then(
      (text) => {
        const fragment = parseFragment(text);
        if (fragment) pasteFragment(fragment, point);
        else notify("No components on the clipboard");
      },
      () => notify(`Press ${MOD}V to paste`),
    );
  const duplicateSelection = () => {
    if (selCount === 0) return;
    const created = mutateWith((d) => {
      const r = duplicateComponents(d, selPaths());
      return { doc: r.doc, value: r.paths };
    });
    selectCreated(created, "Duplicated");
  };
  /** Put the selection on a new plane, drawn around it (⌘G). */
  const groupSelection = () => {
    if (selCount === 0) return;
    const path = mutateWith((d) => {
      const r = groupInPlane(d, selPaths());
      return { doc: r.doc, value: r.path.join(".") };
    });
    if (path) selectNew(path);
  };
  /** Nest the selected components in a new component, which takes their place. */
  const nestSelection = () => {
    if (selCount === 0 || selHasPlane) return;
    const path = mutateWith((d) => {
      const r = nestInComponent(d, selPaths());
      return { doc: r.doc, value: r.path.join(".") };
    });
    if (path) {
      selectNew(path);
      notify(`Nested ${plural(selCount, "component")} in a new component`);
    }
  };
  /** Add a component inside this one, and open it to show where it went. */
  const addChild = (path: string) => {
    const segs = path.split(".");
    const child = mutateWith((d) => {
      const added = addComponent(d, segs);
      // Auto-layout finds it a free spot inside.
      return { doc: autoLayout(added.doc), value: added.path.join(".") };
    });
    if (!child) return;
    setFocus(segs);
    selectNew(child);
  };
  /** Take a component out of the one it's nested in, onto that one's canvas. */
  const moveOut = (path: string) => {
    const segs = path.split(".");
    if (segs.length < 2) return;
    const parent = segs.slice(0, -1);
    const moved = mutateWith((d) => {
      const outer = parent.slice(0, -1);
      const id = segs[segs.length - 1]!;
      const scope = scopeAt(d, outer);
      const taken = scope?.components.some((c) => c.id === id) || scope?.planes.some((p) => p.id === id);
      const newId = taken ? freshId(d, outer, id) : id;
      // On the plane the component it leaves is on, if any.
      const plane = planePathOf(d, parent);
      return {
        doc: reparentComponent(d, segs, outer, undefined, plane ? plane[plane.length - 1] : undefined),
        value: [...outer, newId],
      };
    });
    if (!moved) return;
    notify(`Moved ${nameOf(moved)} out of ${nameOf(parent)}`);
    goTo(moved.join("."));
  };
  const convertToPlane = (path: string) => {
    const plane = mutateWith((d) => {
      const r = componentToPlane(d, path.split("."));
      return { doc: r.doc, value: r.path.join(".") };
    });
    if (plane) {
      setSel(only(plane));
      notify("Converted to a plane: what was inside is on it now");
    }
  };
  /** Remove a plane, leaving what was on it where it is. */
  const ungroup = (path: string) => {
    mutate((d) => removePlane(d, path.split("."), { keepContents: true }));
    setSel(NONE);
  };
  /** Why a component can't become a plane, or null when it can. */
  const whyNotPlane = (path: string): string | null => {
    const node = findComponent(derived.doc, path.split("."));
    if (!node) return "Not a component";
    if (derived.doc.connections.some((c) => c.source.join(".") === path || c.target.join(".") === path))
      return "It has connections of its own";
    if (node.payloads.length > 0) return "It has payloads";
    if (node.src !== undefined) return "It has a source link";
    return null;
  };
  const relayoutSelection = () => {
    if (selCount > 0) mutate((d) => relayoutComponents(d, selPaths()));
  };
  const relayoutLevel = () => mutate((d) => relayoutComponents(d, topPaths(d)));
  const relayoutAll = () => {
    mutate((d) => autoLayout(d, { reset: true }));
    // Everything moved: fit the view once the new arrangement is on the canvas.
    setTimeout(() => canvasApi.current?.fitView(), 50);
  };
  const selectAll = () =>
    setSel({ nodes: levelPaths(derived.doc).map((p) => p.join(".")), edges: [] });
  const nudge = (dx: number, dy: number) => {
    if (selCount === 0) return;
    mutate((d) => {
      const layout = layoutMap(d);
      return outermostItems(d, selPaths()).reduce((acc, segs) => {
        const at = layout.get(segs.join("."))?.at;
        return at ? moveComponent(acc, segs, [at[0] + dx, at[1] + dy]) : acc;
      }, d);
    });
  };
  const reverseEdge = (index: number) => {
    const key = mutateWith((d) => {
      const c = d.connections[index];
      if (!c) throw new Error(`No connection at index ${index}.`);
      const next = setConnectionEndpoints(d, index, c.target, c.source);
      return { doc: next, value: connectionKey(next.connections[index]!) };
    });
    if (key) setSel({ nodes: [], edges: [key] });
  };
  const deleteEdge = (index: number) => {
    mutate((d) => removeConnection(d, index));
    setSel(NONE);
  };

  /** Find / go to: open the canvas it's on, select it, and pan to it. */
  const goTo = (path: string) => {
    const scope = path.split(".").slice(0, -1);
    if (scope.join(".") !== liveFocus.join(".")) setFocus(scope);
    setDiffView(null);
    setSel(only(path));
    setReveal((r) => ({ path, nonce: (r?.nonce ?? 0) + 1 }));
  };

  const closeMenu = useCallback(() => setMenu(null), []);
  const clearReveal = useCallback(() => setReveal(null), []);
  const openPalette = (mode: PaletteMode, at?: { x: number; y: number }) => {
    addAt.current = at ?? null;
    setPalette(mode);
  };
  const escape = () => {
    if (menu) setMenu(null);
    else if (diffView) setDiffView(null);
    else if (editing) setEditingId(null);
    else if (spotlit) setSpotlight(null);
    else if (liveSel.nodes.length > 0 || liveSel.edges.length > 0) setSel(NONE);
    else setFocus((f) => f.slice(0, -1));
  };

  actions.current = {
    editable,
    paletteOpen: palette !== null,
    hasSelection: selCount > 0,
    togglePalette: () => {
      addAt.current = null;
      setPalette((p) => (p ? null : "all"));
    },
    find: () => openPalette("find"),
    undo,
    redo,
    escape,
    selectAll,
    duplicate: duplicateSelection,
    group: groupSelection,
    nudge,
    copyText,
    copied: () => notify(`Copied ${plural(selCount, "component")}`),
    cutDone: () => {
      notify(`Cut ${plural(selCount, "component")}`);
      deleteSelection();
    },
    paste: (fragment) => pasteFragment(fragment),
  };

  const focusName = liveFocus.length > 0 ? nameOf(liveFocus) : null;
  const relayoutItems: MenuItem[] = [
    {
      label: "Re-layout selection",
      hint: selCount > 0 ? "Tidy what's selected and what's in it" : "Select something first",
      icon: <Icon.Layout />,
      disabled: selCount === 0,
      onSelect: relayoutSelection,
    },
    ...(liveFocus.length > 0
      ? [
          {
            label: "Re-layout this level",
            hint: `Everything inside ${focusName}`,
            icon: <Icon.Layout />,
            onSelect: relayoutLevel,
          },
        ]
      : []),
    {
      label: "Re-layout everything",
      hint: "Tidy the whole document",
      icon: <Icon.Layout />,
      onSelect: relayoutAll,
    },
  ];

  /** Actions on the selection: canvas menu and multi-select panel. */
  const selectionActions = (withRelayout: boolean): (MenuItem | "separator")[] => [
    { label: "Copy", icon: <Icon.Copy />, shortcut: `${MOD}C`, onSelect: () => copySelection() },
    { label: "Cut", icon: <Icon.Cut />, shortcut: `${MOD}X`, onSelect: () => copySelection(true) },
    { label: "Duplicate", icon: <Icon.Duplicate />, shortcut: `${MOD}D`, onSelect: duplicateSelection },
    "separator",
    { label: "Group on a plane", icon: <Icon.Group />, shortcut: `${MOD}G`, onSelect: groupSelection },
    {
      label: "Nest in a new component",
      hint: selHasPlane ? "Planes can't be nested" : undefined,
      icon: <Icon.Nested />,
      disabled: selHasPlane,
      onSelect: nestSelection,
    },
    ...(withRelayout
      ? [{ label: selCount > 1 ? "Re-layout selection" : "Re-layout inside", icon: <Icon.Layout />, onSelect: relayoutSelection }]
      : []),
    "separator",
    {
      label: selCount > 1 ? `Delete ${plural(selCount, "item")}` : "Delete",
      icon: <Icon.Trash />,
      shortcut: "⌫",
      danger: true,
      onSelect: deleteSelection,
    },
  ];

  const menuItems = (): (MenuItem | "separator")[] => {
    if (!menu) return [];
    const t = menu.target;
    if (t.kind === "node" && selCount > 1) return selectionActions(true);
    if (t.kind === "node" && findPlane(derived.doc, t.path.split("."))) {
      return [
        {
          label: "Add component here…",
          icon: <Icon.Plus />,
          onSelect: () => openPalette("add", t.at),
        },
        {
          label: "Rename…",
          icon: <Icon.Pencil />,
          onSelect: () => {
            setSel(only(t.path));
            setEditingId(t.path);
          },
        },
        "separator",
        { label: "Ungroup", hint: "Remove the plane, keep what's on it", icon: <Icon.Ungroup />, onSelect: () => ungroup(t.path) },
        "separator",
        ...selectionActions(true).map((a) =>
          a !== "separator" && a.onSelect === deleteSelection ? { ...a, label: "Delete plane and contents" } : a,
        ),
      ];
    }
    if (t.kind === "node") {
      const node = findComponent(derived.doc, t.path.split("."));
      const inside = node?.children.length ?? 0;
      const planeBlocker = inside > 0 ? whyNotPlane(t.path) : null;
      return [
        {
          label: "Open",
          hint: inside > 0 ? `${inside} inside` : "Put components inside it",
          icon: <Icon.Open />,
          onSelect: () => callbacks.onDrillIn(t.path),
        },
        { label: "Add nested component", icon: <Icon.AddChild />, onSelect: () => addChild(t.path) },
        ...(liveFocus.length > 0
          ? [{ label: `Move out of ${focusName}`, icon: <Icon.MoveOut />, onSelect: () => moveOut(t.path) }]
          : []),
        {
          label: "Change shape…",
          icon: <Icon.Shapes />,
          onSelect: () => {
            setSel(only(t.path));
            setEditingId(t.path);
            setPickerFor({ path: t.path, picker: "shape" });
          },
        },
        {
          label: "Change icon…",
          icon: <Icon.Icons />,
          onSelect: () => {
            setSel(only(t.path));
            setEditingId(t.path);
            setPickerFor({ path: t.path, picker: "icon" });
          },
        },
        {
          label: "Change color…",
          icon: <Icon.Color />,
          onSelect: () => {
            setSel(only(t.path));
            setEditingId(t.path);
            setPickerFor({ path: t.path, picker: "color" });
          },
        },
        ...(inside > 0
          ? [
              {
                label: "Convert to plane",
                hint: planeBlocker ?? "What's inside goes on it",
                icon: <Icon.Plane />,
                disabled: planeBlocker !== null,
                onSelect: () => convertToPlane(t.path),
              },
            ]
          : []),
        "separator",
        ...selectionActions(inside > 0),
      ];
    }
    if (t.kind === "edge") {
      return [
        { label: "Reverse direction", icon: <Icon.Swap />, onSelect: () => reverseEdge(t.index) },
        "separator",
        { label: "Delete connection", icon: <Icon.Trash />, shortcut: "⌫", danger: true, onSelect: () => deleteEdge(t.index) },
      ];
    }
    return [
      { label: "Paste here", icon: <Icon.Paste />, shortcut: `${MOD}V`, onSelect: () => pasteFromClipboard(t.at) },
      { label: "Add component…", icon: <Icon.Plus />, onSelect: () => openPalette("add", t.at) },
      { label: "Add plane here", icon: <Icon.Plane />, onSelect: () => addPlaneHere(t.at) },
      { label: "Select all", icon: <Icon.SelectAll />, shortcut: `${MOD}A`, onSelect: selectAll },
      "separator",
      ...relayoutItems,
    ];
  };
  const exportItems: (MenuItem | "separator")[] = [
    {
      label: "Copy for agent",
      hint: derived.valid
        ? "Layout included, language guide prepended"
        : "Fix validation errors first",
      icon: <Icon.Sparkle />,
      disabled: !derived.valid,
      onSelect: () => copyDoc("agent"),
    },
    {
      label: "Copy .arch source",
      hint: "Exactly what the code pane shows",
      icon: <Icon.Copy />,
      onSelect: () => copyDoc("code"),
    },
    "separator",
    {
      label: "Download PNG",
      hint: "Current view, theme colors",
      icon: <Icon.Download />,
      onSelect: () => exportRef.current?.(),
    },
  ];
  // ⌘K: everything the editor can do right now, above find and add.
  const single = liveSelection?.kind === "component" ? liveSelection.path : null;
  const paletteCommands: PaletteCommand[] = [
    ...(editable && selCount > 0
      ? [
          { id: "duplicate", label: "Duplicate selection", icon: <Icon.Duplicate />, shortcut: `${MOD}D`, run: duplicateSelection },
          { id: "group", label: "Group selection on a plane", keywords: "wrap frame region background", icon: <Icon.Group />, shortcut: `${MOD}G`, run: groupSelection },
          ...(selHasPlane
            ? []
            : [{ id: "nest", label: "Nest selection in a new component", keywords: "wrap inside group", icon: <Icon.Nested />, run: nestSelection }]),
          { id: "copy", label: "Copy selection", icon: <Icon.Copy />, shortcut: `${MOD}C`, run: () => copySelection() },
          { id: "relayout-selection", label: "Re-layout selection", keywords: "tidy arrange auto-layout", icon: <Icon.Layout />, run: relayoutSelection },
          { id: "delete", label: `Delete ${plural(selCount, "item")}`, icon: <Icon.Trash />, shortcut: "⌫", run: deleteSelection },
        ]
      : []),
    ...(single
      ? [{ id: "open", label: `Open ${nameOf(single.split("."))}`, keywords: "drill in inside nested", icon: <Icon.Open />, run: () => callbacks.onDrillIn(single) }]
      : []),
    ...(editable && single
      ? [{ id: "child", label: `Add a component inside ${nameOf(single.split("."))}`, keywords: "nest child", icon: <Icon.AddChild />, run: () => addChild(single) }]
      : []),
    ...(editable
      ? [
          { id: "plane", label: "Add a plane", keywords: "region background group frontend backend", icon: <Icon.Plane />, run: () => addPlaneHere() },
          { id: "paste", label: "Paste", icon: <Icon.Paste />, shortcut: `${MOD}V`, run: () => pasteFromClipboard() },
          { id: "select-all", label: "Select all", icon: <Icon.SelectAll />, shortcut: `${MOD}A`, run: selectAll },
          ...(liveFocus.length > 0
            ? [{ id: "relayout-level", label: "Re-layout this level", keywords: "tidy arrange auto-layout", icon: <Icon.Layout />, run: relayoutLevel }]
            : []),
          { id: "relayout-all", label: "Re-layout everything", keywords: "tidy arrange auto-layout", icon: <Icon.Layout />, run: relayoutAll },
        ]
      : []),
    { id: "find", label: "Find a component", keywords: "search go to jump", icon: <Icon.Search />, shortcut: `${MOD}F`, run: () => openPalette("find") },
    { id: "fit", label: "Zoom to fit", keywords: "fit view", icon: <Icon.FitView />, run: () => canvasApi.current?.fitView() },
    { id: "code", label: codeOpen ? "Hide code" : "Show code (.arch)", icon: <Icon.Code />, run: toggleCode },
    { id: "components", label: componentsOpen ? "Hide components sidebar" : "Show components sidebar", keywords: "palette catalog types library", icon: <Icon.Sidebar />, run: toggleComponents },
    ...(liveFocus.length > 0
      ? [
          { id: "up", label: "Go up a level", icon: <Icon.ChevronLeft />, shortcut: "esc", run: () => setFocus(liveFocus.slice(0, -1)) },
          { id: "top", label: "Go to the top level", icon: <Icon.ChevronLeft />, run: () => setFocus([]) },
        ]
      : []),
    ...(stored
      ? [
          ...(derived.valid
            ? [{ id: "agent", label: "Copy for agent", icon: <Icon.Sparkle />, run: () => copyDoc("agent") }]
            : []),
          { id: "source", label: "Copy .arch source", icon: <Icon.Copy />, run: () => copyDoc("code") },
          { id: "png", label: "Download PNG", icon: <Icon.Download />, run: () => exportRef.current?.() },
          { id: "share", label: "Share…", icon: <Icon.Link />, run: () => setShareOpen(true) },
          { id: "history", label: "Show history", icon: <Icon.History />, run: () => openPanel("history") },
          ...(syncFile
            ? [
                ...(repoSync.status?.kind === "draft" || repoSync.status?.kind === "new"
                  ? [{ id: "publish", label: "Publish to GitHub…", keywords: "pull request commit push", icon: <Icon.Send />, run: () => setPublishOpen(true) }]
                  : []),
                { id: "sync", label: `Sync with ${syncFile.path}`, keywords: "github pull update", icon: <Icon.Restore />, run: () => void repoSync.sync() },
              ]
            : [{ id: "move", label: "Move to GitHub…", keywords: "repository store file sync", icon: <GitHubMark />, run: () => setMoveOpen(true) }]),
        ]
      : []),
  ];
  const paletteComponents: PaletteComponent[] = useMemo(() => {
    if (palette === null || palette === "add") return [];
    const out: PaletteComponent[] = [];
    const walk = (items: ArchDoc["components"], planes: ArchDoc["planes"], prefix: string) => {
      const look = (type: string | undefined) => (type ? resolveType(type) : undefined);
      for (const p of planes) {
        const path = prefix === "" ? p.id : `${prefix}.${p.id}`;
        const l = look(p.type);
        out.push({ path, name: p.name ?? p.id, type: p.type, color: l?.color, glyph: l?.glyph, plane: true });
      }
      for (const c of items) {
        const path = prefix === "" ? c.id : `${prefix}.${c.id}`;
        const l = look(c.type);
        out.push({ path, name: c.name ?? c.id, type: c.type, color: l?.color, glyph: l?.glyph });
        walk(c.children, c.planes, path);
      }
    };
    walk(derived.doc.components, derived.doc.planes, "");
    return out;
  }, [palette, derived.doc, resolveType]);

  // Several things selected: the inspector lists them and offers bulk actions.
  const multi: MultiSelection | null =
    liveSelection === null && liveSel.nodes.length + liveSel.edges.length > 1
      ? {
          components: liveSel.nodes.map((path) => {
            const c = findItem(derived.doc, path.split("."));
            return { path, name: c?.name ?? c?.id ?? path, type: c?.type, plane: c?.kind === "plane" };
          }),
          connections: liveSel.edges.length,
          actions:
            selCount > 0
              ? editable
                ? selectionActions(true)
                : [{ label: "Copy", icon: <Icon.Copy />, shortcut: `${MOD}C`, onSelect: () => copySelection() }]
              : editable
                ? [{ label: `Delete ${plural(liveSel.edges.length, "connection")}`, icon: <Icon.Trash />, shortcut: "⌫", danger: true, onSelect: deleteSelection }]
                : [],
        }
      : null;

  const unseen = activity.unseenRevisions;
  const latestAgent = unseen[0];
  const viewingRevisionId = diffView?.kind === "revision" ? diffView.id : null;

  return (
    <div className="flex h-dvh flex-col overscroll-none bg-bg">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-surface px-2">
        {/* The component palette is desktop only; phones add with the + button. */}
        <span className="hidden md:contents">
          <IconButton
            label="Components"
            onClick={toggleComponents}
            active={componentsOpen}
            aria-expanded={componentsOpen}
          >
            <Icon.Sidebar />
          </IconButton>
        </span>
        <Link
          href={back.href}
          className="flex h-7 shrink-0 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-surface-2"
          title={back.label}
        >
          <Icon.ChevronLeft className="h-4 w-4 text-ink-2 md:hidden" />
          <span className="hidden font-display text-[17px] leading-none md:inline">Archer</span>
        </Link>
        <span className="mx-1 hidden h-4 w-px bg-line md:block" />
        <TitleField
          value={derived.doc.title}
          onCommit={(title) => mutate((d) => ({ ...d, title }))}
        />
        {!stored && <Chip className="ml-1 shrink-0">Sandbox</Chip>}
        <IconButton
          label={
            derived.valid
              ? warnings > 0
                ? `Code · ${warnings} warning${warnings === 1 ? "" : "s"}`
                : "Code (.arch)"
              : `Code · ${errors.length} error${errors.length === 1 ? "" : "s"}`
          }
          onClick={toggleCode}
          active={codeOpen}
          className="relative ml-1"
        >
          <Icon.Code />
          {(!derived.valid || warnings > 0) && (
            <span
              className={cx(
                "absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-surface",
                derived.valid ? "bg-warn" : "bg-danger",
              )}
            />
          )}
        </IconButton>

        <div className="ml-auto flex items-center gap-1.5">
          {toast ? (
            <span className="pr-2 text-xs text-accent">{toast}</span>
          ) : !stored ? (
            <span className="hidden pr-2 text-xs text-ink-3 md:inline">Edits aren&apos;t saved</span>
          ) : saveState !== "idle" ? (
            <span className="pr-2 text-xs text-ink-3">
              {saveState === "saving" ? "Saving…" : "Saved"}
            </span>
          ) : null}
          <IconButton label="Undo (⌘Z)" onClick={undo} disabled={!canUndo}>
            <Icon.Undo />
          </IconButton>
          <IconButton label="Redo (⇧⌘Z)" onClick={redo} disabled={!canRedo}>
            <Icon.Redo />
          </IconButton>
          <span className="hidden md:contents">
            {!stored && (
              <IconButton label="Reset" onClick={reset} disabled={!edited}>
                <Icon.Reset />
              </IconButton>
            )}
            <Menu
              width={260}
              align="end"
              items={relayoutItems}
              trigger={({ open, toggle }) => (
                <IconButton label="Re-layout" active={open} onClick={toggle} aria-expanded={open}>
                  <Icon.Layout />
                </IconButton>
              )}
            />
          </span>
          <IconButton label="Add component" onClick={() => openPalette("add")}>
            <Icon.Plus />
          </IconButton>
          {stored && (
            <IconButton
              label={`Activity · ${activity.revisions.length} revisions`}
              onClick={() => (panel ? setPanel(null) : openPanel("history"))}
              active={panel !== null}
              className="relative"
            >
              <Icon.History />
              {unseen.length > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />
              )}
            </IconButton>
          )}
          {stored ? (
            <div className="hidden items-center gap-1.5 md:flex">
              <span className="mx-1.5 h-4 w-px bg-line" />
              <StorageControl
                sync={repoSync}
                onMove={() => setMoveOpen(true)}
                onStopSyncing={() => setStopOpen(true)}
                onPublish={() => setPublishOpen(true)}
              />
              <Button size="sm" icon={<Icon.Link />} onClick={() => setShareOpen(true)} className="ml-1">
                Share
              </Button>
              <Menu
                width={260}
                items={exportItems}
                trigger={({ open, toggle }) => (
                  // Stored in GitHub, the storage control's Publish is the main
                  // action, so Export steps back and only one button is dark.
                  <Button
                    variant={syncFile ? "secondary" : "primary"}
                    size="sm"
                    onClick={toggle}
                    aria-expanded={open}
                    className="ml-1 pr-2"
                  >
                    Export
                    <Icon.ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </Button>
                )}
              />
              <span className="mx-1 h-4 w-px bg-line" />
              <AccountMenu />
            </div>
          ) : (
            isSignedIn === false && (
              <div className="hidden items-center gap-1.5 md:flex">
                <span className="mx-1.5 h-4 w-px bg-line" />
                <Link href="/sign-in" className={cx(buttonCls("secondary", "sm"), "ml-1")}>
                  Sign in
                </Link>
                <Link href="/sign-up" className={cx(buttonCls("primary", "sm"), "ml-1")}>
                  Get started
                </Link>
              </div>
            )
          )}
          <div className="md:hidden">
            <Menu
              width={240}
              items={[
                ...relayoutItems,
                ...(stored
                  ? [
                      { label: "Share", icon: <Icon.Link />, onSelect: () => setShareOpen(true) },
                      syncFile
                        ? {
                            label: "Publish to GitHub…",
                            hint: syncFile.path,
                            icon: <GitHubMark />,
                            disabled: repoSync.status?.kind === "synced" || repoSync.status?.kind === "conflict",
                            onSelect: () => setPublishOpen(true),
                          }
                        : { label: "Move to GitHub…", icon: <GitHubMark />, onSelect: () => setMoveOpen(true) },
                      "separator" as const,
                      ...exportItems,
                    ]
                  : [{ label: "Reset", icon: <Icon.Reset />, disabled: !edited, onSelect: reset }]),
              ]}
              trigger={({ open, toggle }) => (
                <IconButton label="More" active={open} onClick={toggle} aria-expanded={open}>
                  <Icon.More />
                </IconButton>
              )}
            />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Palette
          open={componentsOpen}
          onAdd={addFromPalette}
          onAddPlane={() => addPlaneHere()}
          library={library}
          onFeedback={stored ? () => setFeedbackOpen(true) : undefined}
        />
        <CodePane
          source={source}
          onChange={setSource}
          diagnostics={derived.diagnostics}
          doc={derived.doc}
          open={codeOpen}
          onToggle={toggleCode}
          title={derived.doc.title}
          valid={derived.valid}
          onCopyCode={stored ? () => copyDoc("code") : undefined}
          onCopyForAgent={stored ? () => copyDoc("agent") : undefined}
          selectedPath={selectedPath}
          onSelectPath={(path) =>
            setSelection(
              path === null
                ? null
                : { kind: findPlane(derived.doc, path.split(".")) ? "plane" : "component", path },
            )
          }
        />
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
                    title={liveFocus.slice(0, i + 1).join(".")}
                    onClick={() => setFocus(liveFocus.slice(0, i + 1))}
                    className={cx(
                      "rounded-sm px-1.5 py-0.5 transition-colors hover:bg-surface-2",
                      i === liveFocus.length - 1 ? "font-medium text-ink" : "text-ink-2 hover:text-ink",
                    )}
                  >
                    {findComponent(derived.doc, liveFocus.slice(0, i + 1))?.name ?? seg}
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
                onClick={() => setFocus(liveFocus.slice(0, -1))}
              >
                Up
              </Button>
            </nav>
          )}
          <div className="relative min-h-0 flex-1 bg-ground">
            {diff ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-2 md:p-3">
                <div className="pointer-events-auto flex min-h-9 max-w-full flex-wrap items-center gap-2 rounded-lg border border-line bg-surface py-1 pl-3 pr-1.5 shadow-md">
                  <Icon.Diff className="h-4 w-4 text-ink-2" />
                  <span className="text-sm text-ink md:whitespace-nowrap">
                    {diffView?.kind === "sinceSeen"
                      ? "Changes since you last reviewed"
                      : diffView?.kind === "incoming"
                        ? `${syncFile?.branch ?? "The repository"}'s version compared with your draft`
                        : "Viewing a past revision"}
                  </span>
                  <span className="flex items-center gap-1">
                    {diff.summary.components.filter((c) => c.kind === "added").length > 0 && (
                      <Chip tone="accent">+{diff.summary.components.filter((c) => c.kind === "added").length}</Chip>
                    )}
                    {diff.summary.components.filter((c) => c.kind === "removed").length > 0 && (
                      <Chip tone="danger">−{diff.summary.components.filter((c) => c.kind === "removed").length}</Chip>
                    )}
                    {diff.summary.components.filter((c) => c.kind === "changed").length > 0 && (
                      <Chip tone="warn">~{diff.summary.components.filter((c) => c.kind === "changed").length}</Chip>
                    )}
                  </span>
                  <span className="mx-1 h-4 w-px bg-line" />
                  {diffView?.kind === "sinceSeen" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void activity.markSeen();
                        setDiffView(null);
                      }}
                    >
                      Mark reviewed
                    </Button>
                  )}
                  {diffView?.kind === "incoming" && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={repoSync.syncing}
                        onClick={() => {
                          setDiffView(null);
                          void repoSync.resolve("draft");
                        }}
                      >
                        Keep mine
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={repoSync.syncing}
                        onClick={() => {
                          setDiffView(null);
                          void repoSync.resolve("repo");
                        }}
                      >
                        Keep theirs
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setDiffView(null)}>
                    Exit
                    <Kbd>esc</Kbd>
                  </Button>
                </div>
              </div>
            ) : syncFile?.incoming ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-2 md:p-3">
                <ConflictBanner
                  file={syncFile}
                  busy={repoSync.syncing}
                  onReview={() => setDiffView({ kind: "incoming" })}
                  onResolve={(keep) => void repoSync.resolve(keep)}
                />
              </div>
            ) : syncFile?.problem ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-2 md:p-3">
                <ProblemBanner file={syncFile} />
              </div>
            ) : latestAgent ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-2 md:p-3">
                <div className="pointer-events-auto flex min-h-9 max-w-full flex-wrap items-center gap-2 rounded-lg border border-line bg-surface py-1 pl-2 pr-1.5 shadow-md">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                    {latestAgent.author.kind === "git" ? (
                      <GitHubMark className="h-3.5 w-3.5" />
                    ) : (
                      <Icon.Bot className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <span className="text-sm text-ink md:whitespace-nowrap">
                    <span className="font-medium">{authorLabel(latestAgent.author)}</span>
                    {latestAgent.author.kind === "git" && syncFile
                      ? ` changed ${syncFile.path} on ${syncFile.branch}`
                      : ` made ${unseen.length} change${unseen.length === 1 ? "" : "s"}`}
                    <span className="text-ink-3"> · {relativeTime(latestAgent.createdAt)}</span>
                  </span>
                  <span className="mx-1 h-4 w-px bg-line" />
                  <Button size="sm" variant="secondary" onClick={() => setDiffView({ kind: "sinceSeen" })}>
                    Review
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void activity.markSeen()}>
                    Dismiss
                  </Button>
                </div>
              </div>
            ) : null}
            {liveFocus.length > 0 && flow.nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center p-6">
                <div className="max-w-[320px] text-center">
                  <p className="text-base font-medium text-ink">Nothing inside {focusName} yet</p>
                  <p className="pt-1 text-sm text-ink-3">
                    {editable
                      ? "Drag components here from the palette, or right-click to add one. What you put here is nested in it."
                      : "Nothing is nested in this component."}
                  </p>
                </div>
              </div>
            )}
            <ArchCanvas
              key={liveFocus.join(".")}
              nodes={flow.nodes}
              edges={flow.edges}
              title={derived.doc.title}
              callbacks={callbacks}
              isDark={isDark}
              selection={liveSel}
              highlightedEdge={spotlit}
              reveal={reveal}
              onRevealed={clearReveal}
              exportRef={exportRef}
              apiRef={canvasApi}
              readOnly={!editable}
            />
          </div>
        </main>
        {panel && stored ? (
          <ActivityPanel
            tab={panel}
            onTabChange={setPanel}
            onClose={() => setPanel(null)}
            activity={activity}
            documentId={stored.id}
            title={derived.doc.title}
            viewingRevisionId={viewingRevisionId}
            onViewRevision={(id) => setDiffView(id ? { kind: "revision", id } : null)}
            onRestore={restore}
            onSelectPath={goTo}
            onAddComponent={addFromDrift}
            repo={repo}
            onLinkRepo={() => setRepoOpen(true)}
          />
        ) : (
          <DetailPanel
            doc={derived.laidOut}
            selection={liveSelection}
            multi={multi}
            editing={editing}
            onEditingChange={(on) => setEditingId(on ? selectedId : null)}
            readOnly={!editable}
            mutate={mutate}
            onSelect={(s) => {
              // From the form, a new selection is the same thing re-keyed (a
              // rename, a connection's new label): keep editing it.
              if (editing && s) setEditingId(s.kind === "connection" ? s.key : s.path);
              setSelection(s);
            }}
            spotlight={spotlit}
            onSpotlight={(key) =>
              setSpotlight(key === null || selectedPath === null ? null : { path: selectedPath, key })
            }
            onDrillIn={callbacks.onDrillIn}
            library={library}
            repo={repo}
            pickerFor={pickerFor}
            onPickerOpened={pickerOpened}
          />
        )}
      </div>

      {stored && (
        <>
          <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
          <ShareDialog
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            documentId={stored.id}
            workspaceId={stored.workspaceId}
            publicSlug={stored.publicSlug}
            doc={derived.doc}
            focus={liveFocus.join(".")}
          />
          <RepoDialog
            open={repoOpen}
            onClose={() => setRepoOpen(false)}
            current={repo}
            onSave={(next) =>
              setRepo({ id: stored.id, workspaceId: stored.workspaceId, repo: next })
            }
          />
          {moveOpen && (
            <GitHubFileDialog
              mode="move"
              workspaceId={stored.workspaceId}
              documentId={stored.id}
              initialRepo={repo ? { full: repoKey(repo), branch: repo.branch } : undefined}
              onClose={() => setMoveOpen(false)}
              onDone={() => {
                setMoveOpen(false);
                notify("Stored in GitHub — publish to write the file");
              }}
            />
          )}
          {publishOpen && syncFile && (
            <PublishDialog
              sync={repoSync}
              onClose={() => setPublishOpen(false)}
              onPublished={(r) =>
                notify(r.mode === "pr" ? `Opened pull request #${r.number}` : `Committed to ${syncFile.branch}`)
              }
            />
          )}
          {stopOpen && syncFile && (
            <StopSyncingDialog
              file={syncFile}
              documentId={stored.id}
              workspaceId={stored.workspaceId}
              onClose={() => setStopOpen(false)}
            />
          )}
        </>
      )}
      <CommandPalette
        open={palette !== null}
        mode={palette ?? "all"}
        onClose={() => setPalette(null)}
        onAdd={addFromPalette}
        onAddPlane={editable ? () => addPlaneHere() : undefined}
        library={library}
        commands={paletteCommands}
        components={paletteComponents}
        onGoTo={goTo}
      />
      <ContextMenu at={menu?.at ?? null} items={menuItems()} onClose={closeMenu} />
    </div>
  );
}
