import { format, parse } from "@archer/lang";
import { prepareSource, typeTags } from "../src/analysis";
import { EXAMPLE_STATE } from "../src/reference";
import type { createFakeBackend } from "./fakeBackend";
import type { FakeGitHub } from "./fakeHost";

/** Load the reference's example scenario into a fake backend (and, when given, a fake GitHub). */
export function seedExample(fake: ReturnType<typeof createFakeBackend>, github?: FakeGitHub): void {
  const { user, team, ownedTeam, project, storedProject, customTypes } = EXAMPLE_STATE;
  const { state } = fake;
  const day = (n: number) => Date.parse("2026-08-20T09:00:00Z") + n * 86_400_000;
  state.teams.push({ id: team.id, name: team.name, members: [{ id: "member_acme", userId: user, email: EXAMPLE_STATE.email, role: team.role, createdAt: day(0) }] });
  state.teams.push({
    id: ownedTeam.id,
    name: ownedTeam.name,
    members: ownedTeam.members.map((m, i) => ({ ...m, createdAt: day(i) })),
  });
  state.library.set(user, customTypes.map((t) => ({ ...t })));
  const types = typeTags(customTypes.map((t) => t.tag));

  /** Save each revision the way the app would, oldest first; the last is the document. */
  const history = <R extends { id: string; source: string; author: { kind: "user" | "agent" | "git"; name?: string } }>(
    documentId: string,
    revisions: readonly R[],
    start: number,
  ) => {
    let stored: string | undefined;
    revisions.forEach((r, i) => {
      const prep = prepareSource(r.source, types, stored);
      if (!prep.ok) throw new Error(`Example revision ${r.id} is invalid: ${prep.errors.map((d) => d.message).join("; ")}`);
      stored = prep.text;
      state.revisions.unshift({
        _id: r.id,
        documentId,
        source: prep.text,
        title: prep.title,
        createdAt: start + i * 3_600_000,
        author: r.author,
        ...("summary" in r && typeof r.summary === "string" ? { summary: r.summary } : {}),
        ...("commit" in r && r.commit ? { commit: r.commit as { sha: string; url: string } } : {}),
      });
    });
    return { source: stored!, updatedAt: start + (revisions.length - 1) * 3_600_000 };
  };

  // Shop: created by Claude Code, edited by the user (who has seen everything), shared, checked for drift.
  const shop = history(project.id, project.revisions, Date.parse("2026-09-01T09:00:00Z"));
  state.projects.set(project.id, {
    _id: project.id,
    workspaceId: user,
    title: project.title,
    source: shop.source,
    updatedAt: shop.updatedAt,
    seenRevisionAt: shop.updatedAt,
    publicSlug: project.shareSlug,
    repo: { ...project.repo, linkedAt: shop.updatedAt },
  });
  state.drift.set(project.id, {
    _id: "drift_example",
    documentId: project.id,
    reportedAt: shop.updatedAt + 600_000,
    author: { kind: "agent", name: EXAMPLE_STATE.agentName },
    findings: project.drift.map((f) => ({ ...f })),
  });

  // Payments: imported from its file, then Claude Code's unreviewed, unpublished change.
  const start = Date.parse("2026-08-31T15:00:00Z");
  const payments = history(storedProject.id, storedProject.revisions, start);
  const file = storedProject.revisions[0]!.source;
  state.projects.set(storedProject.id, {
    _id: storedProject.id,
    workspaceId: user,
    title: storedProject.title,
    source: payments.source,
    updatedAt: payments.updatedAt,
    seenRevisionAt: start,
    repo: {
      ...storedProject.file,
      linkedAt: start,
      base: {
        commit: storedProject.revisions[0]!.commit!.sha,
        blob: "8c1f2e3d4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d",
        source: format(parse(file).doc, { stripLayout: true }),
        at: start,
      },
      checkedAt: payments.updatedAt,
    },
  });

  if (github)
    for (const r of EXAMPLE_STATE.github)
      github.repos.set(r.info.fullName.toLowerCase(), {
        info: { ...r.info },
        branches: new Map(Object.entries(r.branches).map(([b, files]) => [b, new Map(Object.entries(files))])),
        commits: r.commits.map((c) => ({ ...c })),
      });
}
