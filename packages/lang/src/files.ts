import { format } from "./format";
import { parse } from "./parser";
import { validate, type ValidateOptions } from "./validate";
import { allViews, remapViewPaths, viewComponents, viewsOf } from "./views";
import type { ArchDoc, ComponentNode, Diagnostic, PlaneNode, Span, ViewNode } from "./types";

/**
 * Documents in several files (spec §2.2). A component can keep its inside in
 * another `.arch` file:
 *
 *   component billing "Billing" @service {
 *     use "./services/billing/billing.arch"
 *   }
 *   import "./services/search/search.arch" as search
 *
 * That file is a document of its own: its top level is the component's
 * inside, and it holds the connections between its parts and the views about
 * them. Connections and views that reach across files live in the file above
 * that sees both sides. Paths never change: `billing.ledger` is the same
 * whether billing's inside is in its own file or not.
 *
 * Archer works on the document put together from its files (`expandFiles`):
 * every component's inside filled in, `use` kept on the component so
 * `splitFiles` can write each piece back to the file it came from. Everything
 * here is pure: callers supply the reading.
 */

/** A diagnostic and the file it is in (a path as the root names it, e.g. `services/billing/billing.arch`). */
export interface FileDiagnostic extends Diagnostic {
  file: string;
}

/** Read a file by its path from the root's folder; undefined when there is none. */
export type ReadFile = (path: string) => string | undefined;

/** The folder a file is in, "" at the top. */
export const dirOf = (file: string): string => (file.includes("/") ? file.slice(0, file.lastIndexOf("/")) : "");

/**
 * Where `use "<rel>"` in `from` points, as a path from the root's folder
 * (`./`, `../` resolved, no leading `/`); null when it is absolute or climbs
 * out of that folder.
 */
export function resolveFile(from: string, rel: string): string | null {
  if (rel.startsWith("/") || /^[a-z]+:/i.test(rel)) return null;
  const parts = dirOf(from) === "" ? [] : dirOf(from).split("/");
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

/** `to` relative to the folder of `from`, starting with `./` or `../`: what a `use` line says. */
export function relativeFile(from: string, to: string): string {
  const a = dirOf(from) === "" ? [] : dirOf(from).split("/");
  const b = to.split("/");
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  const up = a.length - i;
  return (up === 0 ? "./" : "../".repeat(up)) + b.slice(i).join("/");
}

const clone = <T>(v: T): T => structuredClone(v);

/**
 * Every component declared in one file, with its path, top level first: it
 * doesn't go into a component that uses another file (that's the other file's).
 */
function walk(components: ComponentNode[], fn: (c: ComponentNode, path: string[]) => void, path: string[] = []): void {
  for (const c of components) {
    const p = [...path, c.id];
    if (c.use !== undefined) fn(c, p);
    else {
      fn(c, p);
      walk(c.children, fn, p);
    }
  }
}

const under = (p: readonly string[], prefix: readonly string[]): boolean =>
  p.length > prefix.length && prefix.every((s, i) => p[i] === s);

export interface Mount {
  /** The component's path in the whole document. */
  path: string[];
  /** The file its inside lives in, from the root's folder. */
  file: string;
  /** The file that says so. */
  from: string;
}

/** The components whose inside lives in another file, outermost first, each with its file. */
export function mountsOf(doc: ArchDoc, root: string): Mount[] {
  const out: Mount[] = [];
  const visit = (components: ComponentNode[], path: string[], file: string) => {
    for (const c of components) {
      const p = [...path, c.id];
      if (c.use !== undefined) {
        const target = resolveFile(file, c.use);
        if (target !== null) {
          out.push({ path: p, file: target, from: file });
          visit(c.children, p, target);
          continue;
        }
      }
      visit(c.children, p, file);
    }
  };
  visit(doc.components, [], root);
  return out;
}

/** The file a component's declaration is written in. */
export function fileOf(doc: ArchDoc, root: string, path: readonly string[]): string {
  let file = root;
  for (const m of mountsOf(doc, root)) if (under(path, m.path)) file = m.file;
  return file;
}

export interface Expanded {
  /** The document put together: every `use` component's inside filled in. */
  doc: ArchDoc;
  /** Parse and file errors (E4xx), each with its file. Validation is `checkFiles`. */
  diagnostics: FileDiagnostic[];
  /** Every file that went in, the root first. */
  files: string[];
}

const err = (file: string, code: string, message: string, span?: Span): FileDiagnostic => ({
  file,
  code,
  severity: "error",
  message,
  ...(span ? { span } : {}),
});

/**
 * Put a document together from its files, starting at `root`. A component
 * that names a file gets that file's components and planes as its inside;
 * the file's connections and views join the document with their paths
 * prefixed by the component's. A file that can't be read, is used twice or
 * uses itself is reported and leaves the component as it is.
 */
export function expandFiles(root: string, read: ReadFile): Expanded {
  const diagnostics: FileDiagnostic[] = [];
  const files: string[] = [];
  const load = (file: string, chain: string[]): ArchDoc | null => {
    const text = read(file);
    if (text === undefined) return null;
    files.push(file);
    const parsed = parse(text);
    for (const d of parsed.diagnostics) diagnostics.push({ ...d, file });
    const doc = parsed.doc;
    const extra: ArchDoc[] = [];
    walk(doc.components, (c, path) => {
      if (c.use === undefined) return;
      const target = resolveFile(file, c.use);
      if (target === null) {
        diagnostics.push(err(file, "E405", `'${c.use}' isn't a path inside this folder: use a relative path like "./billing/billing.arch".`, c.span));
        return;
      }
      if (c.children.length > 0 || c.planes.length > 0) {
        diagnostics.push(err(file, "E404", `Component '${path.join(".")}' uses ${c.use}, so its parts go in that file, not here.`, c.span));
        return;
      }
      if (chain.includes(target)) {
        diagnostics.push(err(file, "E402", `${c.use} uses ${file} in turn: files can't use each other in a loop.`, c.span));
        return;
      }
      if (files.includes(target)) {
        diagnostics.push(err(file, "E403", `${target} is already used elsewhere: a file describes one component.`, c.span));
        return;
      }
      const sub = load(target, [...chain, target]);
      if (!sub) {
        diagnostics.push(err(file, "E401", `No file at ${target} (from use "${c.use}").`, c.span));
        return;
      }
      c.children = sub.components;
      c.planes = sub.planes;
      if (c.imported && c.name === undefined) c.name = sub.title;
      remapViewPaths(sub, (p) => [...path, ...p]);
      for (const k of sub.connections) {
        k.source = [...path, ...k.source];
        k.target = [...path, ...k.target];
      }
      for (const e of sub.layout) e.path = [...path, ...e.path];
      extra.push(sub);
    });
    for (const sub of extra) {
      doc.connections.push(...sub.connections);
      doc.sequences.push(...sub.sequences);
      doc.flows.push(...sub.flows);
      doc.machines.push(...sub.machines);
      doc.models.push(...sub.models);
      doc.layout.push(...sub.layout);
      doc.viewLayout.push(...sub.viewLayout);
    }
    return doc;
  };
  const doc = load(root, [root]);
  if (!doc) {
    diagnostics.push(err(root, "E401", `No file at ${root}.`));
    return { doc: parse(`arch "Untitled" v0.2`).doc, diagnostics, files };
  }
  return { doc, diagnostics, files };
}

/** An empty document with this title and version. */
const emptyDoc = (title: string, version: string): ArchDoc => ({
  kind: "doc",
  title,
  version,
  components: [],
  planes: [],
  connections: [],
  sequences: [],
  flows: [],
  machines: [],
  models: [],
  layout: [],
  viewLayout: [],
});

/**
 * Split a document into its files: the inverse of expandFiles. Each file gets
 * the declarations inside its component, every connection whose two ends are
 * both inside it (deepest file wins) and every view whose components all are,
 * with paths made relative to it; the rest stays in the file above. A
 * component that uses a file keeps only its head (and `use`); an imported one
 * leaves its display name to the file's title. Files hold no layout, unless
 * `layout` is set: then the root keeps the whole document's layout block
 * (positions are presentation, and Archer's). Returns canonical text per
 * file, the root first.
 */
export function splitFiles(doc: ArchDoc, root: string, opts: { layout?: boolean } = {}): Map<string, string> {
  const mounts = mountsOf(doc, root);
  const owner = (paths: readonly (readonly string[])[]): Mount | undefined => {
    let best: Mount | undefined;
    for (const m of mounts) if (paths.every((p) => under(p, m.path)) && (!best || m.path.length > best.path.length)) best = m;
    return best;
  };
  const docs = new Map<string, ArchDoc>();
  const fileDoc = (m: Mount | undefined): ArchDoc => {
    const key = m ? m.file : root;
    let d = docs.get(key);
    if (!d) {
      d = emptyDoc(m ? titleOf(doc, m.path) : doc.title, doc.version);
      docs.set(key, d);
    }
    return d;
  };
  const strip = (m: Mount | undefined, p: readonly string[]): string[] => (m ? p.slice(m.path.length) : [...p]);

  // Declarations: the root's, then each mount's inside, heads only where a file takes over.
  const cut = (components: ComponentNode[], here: string[]): ComponentNode[] =>
    components.map((c) => {
      const copy = clone(c);
      const p = [...here, c.id];
      if (mounts.some((m) => m.path.join(".") === p.join("."))) {
        copy.children = [];
        copy.planes = [];
        if (copy.imported) delete copy.name;
      } else copy.children = cut(c.children, p);
      return copy;
    });
  const top = fileDoc(undefined);
  top.components = cut(doc.components, []);
  top.planes = clone(doc.planes);
  for (const m of mounts) {
    const node = find(doc, m.path)!;
    const d = fileDoc(m);
    d.components = cut(node.children, m.path);
    d.planes = clone(node.planes) as PlaneNode[];
  }

  for (const c of doc.connections) {
    const m = owner([c.source, c.target]);
    fileDoc(m).connections.push({ ...clone(c), source: strip(m, c.source), target: strip(m, c.target) });
  }
  for (const v of allViews(doc)) {
    const names = viewComponents(v);
    const m = names.length > 0 ? owner(names) : undefined;
    const d = fileDoc(m);
    const one = emptyDoc("", "");
    (viewsOf(one, v.kind) as ViewNode[]).push(clone(v.node));
    remapViewPaths(one, (p) => strip(m, p));
    (viewsOf(d, v.kind) as ViewNode[]).push(...(viewsOf(one, v.kind) as ViewNode[]));
  }

  const out = new Map<string, string>();
  if (opts.layout) {
    top.layout = clone(doc.layout);
    top.viewLayout = clone(doc.viewLayout);
  }
  out.set(root, format(top, { stripLayout: !opts.layout }));
  for (const m of mounts) out.set(m.file, format(fileDoc(m), { stripLayout: true }));
  return out;
}

function find(doc: ArchDoc, path: readonly string[]): ComponentNode | undefined {
  let list = doc.components;
  let found: ComponentNode | undefined;
  for (const seg of path) {
    found = list.find((c) => c.id === seg);
    if (!found) return undefined;
    list = found.children;
  }
  return found;
}

/** A used file's title: the component's display name, else its id. */
const titleOf = (doc: ArchDoc, path: readonly string[]): string => {
  const c = find(doc, path)!;
  return c.name ?? c.id;
};

/** Marks a node copied in from another file, whose diagnostics belong to that file. */
const ELSEWHERE: Span = { start: { line: 0, col: 0, offset: -1 }, end: { line: 0, col: 0, offset: -1 } };

/** A file's own components and those of the files below it, with their spans marked as elsewhere. */
function stubs(components: ComponentNode[]): ComponentNode[] {
  return components.map((c) => ({
    ...clone(c),
    span: ELSEWHERE,
    payloads: [],
    planes: c.planes.map((p) => ({ ...p, span: ELSEWHERE })),
    children: stubs(c.children),
  }));
}

/**
 * Validate a document in several files, file by file: each file is checked
 * with the declarations of the files it uses filled in (so it may name
 * `billing.ledger`), and each diagnostic is reported in the file it is in.
 * File errors from expandFiles come first.
 */
export function checkFiles(root: string, readOnce: ReadFile, opts: ValidateOptions = {}): { doc: ArchDoc; files: string[]; diagnostics: FileDiagnostic[] } {
  // Each file is read once (stdin can only be).
  const cache = new Map<string, string | undefined>();
  const read: ReadFile = (p) => {
    if (!cache.has(p)) cache.set(p, readOnce(p));
    return cache.get(p);
  };
  const whole = expandFiles(root, read);
  const out: FileDiagnostic[] = [...whole.diagnostics];
  const broken = new Set(whole.diagnostics.filter((d) => d.code.startsWith("E4") || d.code === "E001").map((d) => d.file));
  const mounts = mountsOf(whole.doc, root);
  for (const file of whole.files) {
    if (broken.has(file)) continue;
    const own = parse(read(file)!).doc;
    const mine = mounts.filter((m) => m.from === file);
    const base = file === root ? [] : mounts.find((m) => m.file === file)!.path;
    for (const m of mine) {
      const inWhole = find(whole.doc, m.path)!;
      const here = find(own, m.path.slice(base.length));
      if (!here) continue;
      here.children = stubs(inWhole.children);
      here.planes = inWhole.planes.map((p) => ({ ...p, span: ELSEWHERE }));
    }
    // expandFiles has judged the files (E4xx) from where each really is.
    for (const d of validate(own, opts))
      if (d.span?.start.offset !== -1 && d.code !== "E403" && d.code !== "E405") out.push({ ...d, file });
  }
  return { doc: whole.doc, files: whole.files, diagnostics: out };
}

/**
 * Keep a component's inside in its own file, `file` (a path from the root's
 * folder, e.g. `services/billing/billing.arch`): it gets `use` with the path
 * relative to the file it's declared in, and files used from inside it are
 * re-pointed from their new place. Nothing else changes: the document is the
 * same, only where splitFiles writes its pieces.
 */
export function moveToFile(doc: ArchDoc, root: string, path: readonly string[], file: string): ArchDoc {
  if (!/\.arch$/.test(file) || resolveFile(root, `./${file}`) !== file)
    throw new Error(`'${file}' isn't a path like services/billing/billing.arch inside the repository folder.`);
  const next = clone(doc);
  const node = find(next, path);
  if (!node) throw new Error(`No component at '${path.join(".")}'.`);
  if (node.use !== undefined) throw new Error(`'${path.join(".")}' is already in ${fileOf(doc, root, [...path, "_"])}.`);
  const before = mountsOf(next, root);
  if (before.some((m) => m.file === file) || file === root) throw new Error(`${file} already holds part of this document.`);
  const from = fileOf(next, root, path);
  repoint(next, before, path, file);
  node.use = relativeFile(from, file);
  return next;
}

/** Bring a component's inside back into the file it's declared in: the reverse of moveToFile. */
export function moveInline(doc: ArchDoc, root: string, path: readonly string[]): ArchDoc {
  const next = clone(doc);
  const node = find(next, path);
  if (!node || node.use === undefined) throw new Error(`'${path.join(".")}' doesn't use a file.`);
  const before = mountsOf(next, root);
  repoint(next, before, path, fileOf(next, root, path));
  delete node.use;
  delete node.imported;
  return next;
}

/** Re-point the `use` of mounts declared directly inside `path` so they're relative to `file`. */
function repoint(doc: ArchDoc, mounts: Mount[], path: readonly string[], file: string): void {
  const self = mounts.find((m) => m.path.join(".") === path.join("."));
  const declaredIn = self ? self.file : undefined;
  for (const m of mounts) {
    if (!under(m.path, path)) continue;
    // Only those written in the component's own body, not in files further down.
    if (declaredIn !== undefined ? m.from !== declaredIn : mounts.some((o) => under(m.path, o.path) && under(o.path, path))) continue;
    find(doc, m.path)!.use = relativeFile(file, m.file);
  }
}
