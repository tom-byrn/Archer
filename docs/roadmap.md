# Archer Roadmap — v0.1 → v1.0

One git commit per version. Every version leaves the repo working (tests green, app
builds). Versions track the build order from `product-spec.md`: language first, then
rendering, then editing, then persistence, then the agent handoff.

## v0.1 — Language core
Monorepo scaffold (pnpm workspaces: `packages/lang`, `packages/catalog`, `apps/web`
placeholder). `@archer/lang`: lexer + recursive-descent parser → typed AST for the
full v0.1 grammar (header, components, desc, payload fences, connections, layout
block), with positioned parse errors (`E001`). Fixture-based test suite (vitest)
including the spec's worked example.

## v0.2 — Validator, formatter, agent export
Validation pass implementing all spec §8 codes (E002, E003, E101, E201, W301, W302,
W303). Canonical formatter (section order, sorted connections, normalized whitespace)
with idempotency tests (`format(format(x)) === format(x)`). Agent-export compiler:
strip layout, prepend the fixed spec header. Round-trip tests: parse → format → parse
gives an equal AST.

## v0.3 — Auto-layout engine
Deterministic grid layout for components missing layout entries: layered
(topological-ish) placement, containers sized to content, children laid out in the
parent's grid. `applyLayout(doc)` returns a doc whose layout block is complete.
Property tests: every component gets an entry; existing entries are never moved.

## v0.4 — Read-only web renderer
`apps/web`: Next.js (App Router, TS, Tailwind) + React Flow. Paste/edit Archer in a
code pane → live canvas render (custom nodes: generic box, typed icon node, plane
group; custom edges with type chip + label). Diagnostics panel with error codes.
PNG export of current view. Starter catalog (~15 types) with icons in
`packages/catalog`. Browser-verified.

## v0.5 — Editable canvas
The file stays source of truth; all canvas edits go through AST transforms →
canonical format → re-render (one mutation path). Palette (catalog + search) with
drag-to-place; node move/resize writes the layout block; arrow drawing where a drop
on empty canvas snaps back (E101 is unrepresentable via UI); delete; rename; type
assignment. Two-way live code view (code edits re-render; canvas edits rewrite code).
Undo/redo over the text states. Browser-verified.

## v0.6 — Detail panel
Click a component → right panel: display name, id, type picker, description editor,
payload editors (json / yaml / table / markdown) with live per-format validation and
document validity badge. Connection detail (type, label) on edge select.
Browser-verified.

## v0.7 — Nesting & drill-down
Drop a component onto a plane to nest it (AST move, path rewrite of connections);
toggle container display icon ↔ plane; double-click an icon container to drill in
(breadcrumb navigation, per-level canvas); child layout relative to parent grid.
Cross-boundary edges render at the highest visible level. Browser-verified.

## v0.8 — Catalog depth & custom components
Curated catalog to ~50 types across aws / gcp / vercel / databases / queues / saas /
generic, each with icon + default styling. User-defined custom components (name,
icon choice, namespace) saved to a personal library and usable from the palette.
Unresolved types render generic with W301.

## v0.9 — Persistence & accounts (Convex)
Convex schema (documents: source text + title + updatedAt; componentLibrary), CRUD,
autosave (debounced write of canonical text), document list home page, auth
(Convex Auth). Local anonymous Convex dev deployment for development; wiring for
cloud deploy documented. Custom components move from local storage to Convex.

## v1.0 — Agent handoff & polish
Export bar: **Copy code**, **Copy for agent** (stripped canonical + spec preamble),
**Export PNG**. In-app language reference page (rendered from the language spec) so
users can hand agents a docs link. Dogfood example document included as a template.
Full-pass browser verification of the core loop from the product spec's success
criterion; README rewritten for the repo. Tag `v1.0`.

## Deliberately after v1.0
Sharing/multiplayer, app MCP server, codebase sync, per-technology payload
validation, multi-file imports, named views.
