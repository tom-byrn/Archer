# Mobile app

`apps/mobile` (`@archer/mobile`) is Archer's companion app for iOS and Android,
built with Expo (SDK 58), expo-router and React Native. It signs in to the same
Clerk instance as the web app, reads and writes the same Convex deployment, and
draws diagrams with the same renderer as share images. It adds no backend: every
call goes to an existing Convex function.

## What it does

- **Documents**: the selected workspace's documents, each with its diagram as a
  thumbnail. Switch workspace from the title; create a document (blank or from
  one of the dashboard's samples); long-press to delete.
- **Diagram**: pinch to zoom, drag to pan, double-tap to zoom in or back out to
  fit. Tap a component to open it.
- **Components**: what's on the canvas, plane by plane, with a search across
  every level (names, ids, types, descriptions).
- **A component**: its type, description, `src` links (opened on the linked
  GitHub repository), the canvas inside it (drawn, and listed), its connections
  in and out, and its payloads (tables drawn as tables, markdown rendered, json
  and yaml as written, each with its validation result).
- **Code**: the `.arch` source, highlighted by the editor's own tokenizer, with
  diagnostics. Copy it, or copy it for an agent (`compileForAgent`, as the web's
  "Copy for agent"). Editors can edit the source; Save is offered once it
  validates without errors.
- **Edit a component**: its name, type and description, through the language's
  `setComponentMeta` and the canonical formatter.
- **History**: every save, by you, an agent (over MCP) or a commit (repo sync),
  with agent changes since you last looked marked until you mark them reviewed.
  Open a version to see what changed from the one before (`diffDocs`: layout
  moves aren't changes) and the diagram as it was; editors can restore it.
- **Sharing**: create, share, copy or stop a public share link. Share links
  others send open read-only, signed in or not (paste one, or open
  `archer://share/<slug>`).
- **Examples**: the language docs' worked examples, bundled: they work signed
  out and offline.
- **Account**: profile, workspace, theme (System, Light or Dark, as on the
  web), links to the docs, feedback (`feedback.send`, read on the admin
  dashboard with the device "Archer app · iOS …"), sign out.

## How it shares code

| from | used for |
| --- | --- |
| `@archer/lang` | parsing, validation, formatting, transforms, diffs |
| `@archer/catalog` (+ `/icons`, `/logos`) | type colors, glyphs, logos |
| `@archer/mcp/examples`, `@archer/mcp/analysis` | the worked examples; diagnostics exactly as the CLI and MCP tools report them |
| `apps/web/lib/svg.ts` | diagrams: `renderArch` is `renderArchSvg` plus the diagram's size and every box's rectangle, which taps are hit-tested against |
| `apps/web/lib/highlightArch.ts` | code highlighting (the tokenizer is `lib/archTokens.ts`, free of CodeMirror) |
| `apps/web/lib/connectionsOf.ts`, `lib/samples`, `lib/landingSample.ts` | a component's connections, new-document samples, the welcome screen's diagram |
| `apps/web/convex/_generated/api` | types for the Convex functions (a type-only import; at runtime `api` is Convex's `anyApi`) |

`@web/*` is an alias (`tsconfig.json` paths, which Metro and Vitest follow) to
`apps/web/lib/*`. Only pure modules go through it: nothing that imports React
DOM, Next, CodeMirror or server code.

The share image is SVG markup; react-native-svg draws it after
`src/lib/nativeSvg.ts` adapts it: icons are nested `<svg>`s, which
react-native-svg would place at the origin, so each becomes a `<g>` with the
same transform and its `currentColor` resolved; character references in text are
decoded; font stacks become one font. So a change to how diagrams look belongs
in `lib/svg.ts`, and the app follows.

## Setup

1. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local` and set
   `EXPO_PUBLIC_CONVEX_URL` and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` to the web
   app's `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
   Without them the app runs with the examples only.
2. In the Clerk dashboard, under **Native applications**, enable the Native API
   and add the app's sign-in redirect to the allowlist for mobile SSO
   redirects: `archer://sso-callback` for builds of the app. A development
   server's redirect starts with `exp://`; the welcome screen requests
   `AuthSession.makeRedirectUri({ path: "sso-callback" })`, so allowlist what
   that returns where you run it. GitHub sign-in itself is the connection the
   web already uses.

## Run it

```sh
pnpm install
pnpm mobile                                  # Expo dev server (pnpm --filter @archer/mobile start)
pnpm --filter @archer/mobile exec expo run:ios       # development build (Xcode)
pnpm --filter @archer/mobile exec expo run:android   # development build (Android Studio)
pnpm --filter @archer/mobile web             # in a browser
```

## Checks

```sh
pnpm --filter @archer/mobile typecheck
pnpm --filter @archer/mobile test            # src/lib: SVG adaptation, nested canvases, hit-testing, outline, links
pnpm --filter @archer/mobile export:ios      # bundles the app with Metro, as a release build does
pnpm --filter @archer/mobile export:android
```

## Links into the app

The app's scheme is `archer`, and its routes mirror the web's:
`archer://share/<slug>`, `archer://documents/<id>` (in the selected
workspace), `archer://examples/<slug>`. Opening `https://tryarcher.dev/share/…`
links in the app as well would take universal links (iOS) and app links
(Android): an `apple-app-site-association` and `assetlinks.json` served by the
site, and the domain added to `app.json`. That isn't set up.

## Not yet

- Releases: there's no EAS configuration. EAS Build picks the package manager
  from the lockfiles, and the repository root also has a `package-lock.json`.
- Drawing on the canvas: the app reads, reviews and edits text; moving,
  connecting and nesting components stay on the web.
- Custom types draw like unknown types (the share image's catalog-only look).
