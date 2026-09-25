import { prepareSource, typeTags } from "../src/analysis";
import { EXAMPLE_STATE } from "../src/reference";
import type { createFakeBackend } from "./fakeBackend";

/** Load the reference's example scenario into a fake backend. */
export function seedExample(fake: ReturnType<typeof createFakeBackend>): void {
  const { user, team, project, customTypes } = EXAMPLE_STATE;
  const { state } = fake;
  state.teams.push({ id: team.id, name: team.name, members: { [user]: team.role } });
  state.library.set(user, customTypes.map((t) => ({ ...t })));

  const types = typeTags(customTypes.map((t) => t.tag));
  const start = Date.parse("2026-09-01T09:00:00Z");
  let stored: string | undefined;
  project.revisions.forEach((r, i) => {
    const prep = prepareSource(r.source, types, stored);
    if (!prep.ok) throw new Error(`Example revision ${r.id} is invalid: ${prep.errors.map((d) => d.message).join("; ")}`);
    stored = prep.text;
    state.revisions.unshift({
      _id: r.id,
      documentId: project.id,
      source: prep.text,
      title: prep.title,
      createdAt: start + i * 3_600_000,
      author: r.author,
      ...("summary" in r ? { summary: r.summary } : {}),
    });
  });
  const updatedAt = start + (project.revisions.length - 1) * 3_600_000;
  state.projects.set(project.id, {
    _id: project.id,
    workspaceId: user,
    title: project.title,
    source: stored!,
    updatedAt,
    repo: { ...project.repo, linkedAt: updatedAt },
  });
  state.drift.set(project.id, {
    _id: "drift_example",
    documentId: project.id,
    reportedAt: updatedAt + 600_000,
    author: { kind: "agent", name: EXAMPLE_STATE.agentName },
    findings: project.drift.map((f) => ({ ...f })),
  });
}
