# Repo sync — documents stored in a repository

A document is stored in one of two places, chosen when it's created:

- **In Archer** (New document, From sample, MCP `create_project`, `archer
  push`): Archer's copy is the truth. Agents write through MCP.
- **In a `.arch` file in a GitHub repository** (From GitHub, or Move to GitHub
  later): the file on its branch is the truth. Agents working in the codebase
  edit the file with the code it describes, in the same commits and pull
  requests; the canvas follows the branch. Edits made in Archer are a draft
  that you publish back as a pull request (or a commit).

That's the Mintlify model: the repository holds the content, the web app is
an editor with drafts. It keeps architecture changes on the same branches as
the code — a change lands when its pull request merges and reverts with it —
and needs no setup from agents: any agent can edit a file, and `archer check`
validates it without signing in.

## The model

A stored document (`documents.repo` with `path` set, `convex/schema.ts`) has
three versions of its architecture:

| | what | where |
| --- | --- | --- |
| **base** | the file as Archer last imported or published it | `repo.base` (commit, blob sha, source) |
| **draft** | the document, as edited in Archer or over MCP | `documents.source` |
| **head** | the file on the branch now | GitHub |

**The file holds architecture only**: canonical form, no `layout` block.
Canvas positions stay in Archer, so moving boxes never needs a commit, and
the repository only sees architecture changes. A layout block in the file is
honored on import and dropped on the next publish.

Anything the draft changes relative to base is *unpublished*. The header
shows the file, its status (Synced · N unpublished · Not created yet ·
Conflict · Sync problem) and **Publish** when there's something to publish.

## Keeping up with the branch

Archer syncs a document when it's opened, when its tab regains focus (at most
every 30 s), and — with a webhook set up — on every push that changes the
file, whether or not anyone has it open. A sync compares head with base and
the draft (`planSync` in `apps/web/lib/repoSync.ts`):

| situation | result |
| --- | --- |
| head is base (or only formatting/comments changed) | nothing to do |
| head already has the draft's architecture (e.g. your pull request merged) | base moves; the draft is published |
| no draft | the document becomes head (positions kept, new components auto-placed) |
| draft and head changed different things | merged automatically (`mergeDocs` in `packages/lang`: components match by path, payloads by name, connections by identity) |
| both changed the same thing | **conflict**: the canvas shows who changed what; *Review* diffs the repository's version against your draft; *Keep mine* / *Keep theirs* settles it (the other side's non-conflicting changes stay either way) |
| head doesn't validate, or the file was deleted | **sync problem**: the last good version stays until the file is fixed |

Imports are revisions credited to the commit's author, with the commit
message as the summary and a link to the commit, so History shows who changed
the architecture, and the canvas highlights it until you review it.

## Publishing

**Publish** writes the draft's architecture to the file:

- **Open a pull request** (default): a branch `archer/<title>-<id>` from the
  branch head, one commit, a PR whose body lists the changes. Publishing again
  while it's open adds a commit to it. When it merges, the next sync sees the
  draft on the branch and marks it published.
- **Commit to the branch**: straight to it, with your own write access.

Publishing is refused while a conflict waits, when the draft has errors, or
when the file moved since the last sync (the editor syncs and retries once).

## Setup

**Reading and publishing** use the signed-in user's GitHub token from Clerk
(`lib/server/github.ts`). Public repositories work with Clerk's default
scopes; private repositories — and publishing anywhere — need the `repo`
scope ("Grant access" in the repository picker; see `docs/deploy.md` §2).

**Live updates** need GitHub to tell Archer about pushes. Either:

- **A repository webhook** (simplest): the repository's *Settings → Webhooks
  → Add webhook*: payload URL `https://<your-domain>/api/github/webhook`,
  content type `application/json`, the secret you set as
  `GITHUB_WEBHOOK_SECRET`, events *Pushes* and *Pull requests*.
- **The Archer GitHub App** (for many repositories, and private ones without
  anyone's `repo` scope): create a GitHub App with the same webhook URL and
  secret, repository permissions *Contents: read & write*, *Pull requests:
  read & write*, *Metadata: read*, subscribed to *Push* and *Pull request*;
  set `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY`, and install it on the
  repositories. Syncs then read as the App; people whose own GitHub access
  can't write to the repository can still publish *pull requests* through
  it (direct commits always need the person's own push access).

Without either, documents still sync whenever someone opens them.

| Variable (web app) | |
| --- | --- |
| `GITHUB_WEBHOOK_SECRET` | Verifies deliveries (`X-Hub-Signature-256`). Without it `/api/github/webhook` answers 503. |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` | Optional: the GitHub App (PEM; `\n` escapes are fine). |
| `GITHUB_API_URL` | Optional: REST base URL for GitHub Enterprise (default `https://api.github.com`). |

## Security

- Linking a file (From GitHub, Move to GitHub) is server-only
  (`repoSync.create`/`link` require the service credential): the server
  first checks that the user can read the repository **with their own
  GitHub access**, so a workspace can't be pointed at someone else's private
  repository and fed its contents by the App.
- The webhook authenticates by signature only, then acts in Convex as the
  user who linked each document (their workspace role still applies). Its
  lookup of the documents stored on a branch (`repoSync.documentsForPush`)
  takes the bare server credential and returns ids only.
- Syncs and imports go through the same validation gate as MCP writes
  (`prepareSource` in `packages/mcp/src/analysis.ts`).

## Agents

- **In the repository**: edit the file (`get_project` returns its path in
  `repository.path` and says so). Keep it canonical (`archer fmt`), omit the
  layout block, and gate it in CI with `archer check` and `archer fmt --check`.
  A rule in the repo's `CLAUDE.md`/`AGENTS.md` ("keep `architecture.arch` in
  step with architectural changes") makes it routine.
- **Over MCP**: `update_project` on a stored document saves to its draft (the
  result says so); a person publishes it. `archer pull` writes the draft into
  the file without its layout, ready to commit.

## Code map

| | |
| --- | --- |
| `packages/lang/src/merge.ts` | three-way semantic merge |
| `apps/web/lib/repoSync.ts` | the rules: file source, `planSync`, status, publish text (pure) |
| `apps/web/lib/server/repoSync.ts` | the engine: sync, resolve, publish, create, link, webhook |
| `apps/web/lib/githubApi.ts`, `lib/server/github.ts` | GitHub REST (files, branches, pull requests, App tokens) |
| `apps/web/app/api/github/{files,projects,link,sync,publish,webhook}` | routes |
| `apps/web/convex/repoSync.ts` | Convex side: create, link, unlink, applyImport, setState, documentsForPush |
| `apps/web/components/RepoSync.tsx`, `GitHubFileDialog.tsx`, `RepoPicker.tsx` | editor UI and dialogs |
