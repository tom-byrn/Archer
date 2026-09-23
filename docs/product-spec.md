# Archer — Product Spec v1 (Draft)

A web-based architecture canvas that compiles to Archer (see `language-spec.md`).
Excalidraw's feel, real technology components, strict connections, and a one-click
handoff of the whole architecture to a coding agent as code + image.

## Positioning (from research, Sept 2026)

No existing tool combines: free drag-and-drop canvas whose state round-trips through a
text file, a semantic component model with strict connection rules, drill-down into
validated payloads, and diagram-as-agent-spec as the core loop. Closest competitor is
Eraser.io, which overlaps on surface (canvas feel, icons, DSL, MCP) but not substance:
its DSL carries no structured data or positions, typos auto-create phantom nodes, drag
edits are a fragile overlay, and its Git sync exports PNGs, not code. Our durable
differences are architectural for them: file-as-source-of-truth, strict validation,
payloads-in-nodes, positions-in-file (quarantined), and the diagram→spec→agent
direction (theirs is code→diagram documentation).

## v1 scope

**In:** solo use (accounts, but no sharing/multiplayer), one `.arch` document per
canvas, cloud-stored; curated component catalog + user-defined components; typed and
untyped components and connections; nesting with icon/plane display and click-in
navigation; detail panel with description + validated payloads; live code view; copy
code / copy-as-prompt / PNG export; paste-in of external `.arch` text with grid
auto-layout.

**Out (explicitly):** multiplayer/sharing, codebase sync, per-technology payload
validation (real SQL linting etc.), concurrent human+agent editing/merging, multi-file
documents, MCP server for the app itself (fast-follow after v1).

## Stack

- **Frontend:** Next.js (App Router) on **Vercel**, canvas built on **React Flow**
  (`@xyflow/react`), snap-to-grid.
- **Backend/storage/auth:** **Convex** — documents, user component libraries, auth
  (Convex Auth). The `.arch` source text is the stored artifact; Convex holds it plus
  denormalized metadata (title, updated-at, thumbnail).
- **Language tooling:** `packages/lang` — a pure-TypeScript package with zero React/
  Convex dependencies: parser → AST, validator (error codes from the spec §8),
  formatter (canonical form), auto-layout engine, agent-export compiler. Runs in the
  browser and in tests; usable later by a CLI/MCP server unchanged.
- Monorepo: `apps/web` + `packages/lang` + `packages/catalog` (the curated type
  catalog: ids, names, icons).

## Core loop (the product in one paragraph)

Drag components from the palette (or press `/` to search the catalog) onto a gridded
canvas. Drag arrows between them — an arrow released over empty canvas snaps back;
dangling connections cannot exist. Click a component to open its detail panel:
description, payloads (JSON/YAML/table/markdown, validated live), type. Nest by
dropping a component onto a plane, or toggle any container between icon and plane;
double-click an icon container to drill into it. Every edit rewrites the `.arch` file
(debounced), and the code view updates live; edits in the code view re-render the
canvas (auto-layouting anything without a layout entry). When ready: **Copy for
agent** (canonical code, layout stripped, spec header prepended) and **Export PNG**
(current view), paste both into Claude Code / Cursor.

## Key screens & components

1. **Canvas** — React Flow: custom node types (generic box/circle, typed icon node,
   plane/group node with icon badge in top-left), custom edge with type chip + label,
   grid snap, pan/zoom, drill-in navigation (breadcrumb trail when inside a plane).
2. **Palette** — curated catalog grouped by namespace (AWS, Vercel, databases, …),
   search, plus "My components"; drag-to-place.
3. **Detail panel** (right side) — display name, id (read-only), type picker,
   description editor, payload editors with format tabs and live validation state.
4. **Code view** — toggleable split pane; read/write; parse errors and validation
   diagnostics inline with codes (`E101` …); document-level valid/invalid badge.
5. **Export bar** — Copy code · Copy for agent · Export PNG.
6. **Home** — document list (Convex), new/rename/delete.

## Editing model

- File is source of truth; canvas edits compile to file edits through one internal
  mutation path (edit → AST transform → format → save → re-render). No separate
  canvas state that can drift.
- One editor at a time (v1): last-write-wins on the stored text, no merging.
- Auto-layout: deterministic layered layout on the grid — connections flow left to
  right with few crossings and straight edges, planes wrap their children. A document
  with no positions is arranged from scratch; otherwise existing positions are kept,
  new components are placed next to what they connect to, and a plane that has to
  grow nudges aside what it would overlap. The result is persisted. The
  "Auto-layout" button re-arranges the whole document (collapsed containers stay
  collapsed).

## Build order (each stage independently useful)

1. **`packages/lang`** — parser, validator, formatter, agent-export, auto-layout, with
   a big fixture test suite. The language works before the app exists.
2. **Read-only web renderer** — paste/import `.arch`, see the canvas, export PNG.
3. **Editable canvas** — palette, drag/drop, arrows with snap-back, detail panel,
   nesting/drill-in, live code view. Convex persistence + auth.
4. **Polish + catalog depth** — top ~50 catalog types with icons, custom components,
   copy-as-prompt header tuning against real agent runs (dogfood: spec this app's own
   next features in it).

## Success criteria for v1

Design a real system on the canvas in <15 minutes, hit Copy for agent, paste into
Claude Code, and the agent scaffolds a project whose structure matches the diagram —
including the schema from the Postgres node's payload — without asking clarifying
questions the diagram already answers.
