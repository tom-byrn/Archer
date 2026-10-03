import { afterEach, describe, expect, it } from "vitest";
import { connectInProcess } from "../scripts/inProcess";
import { db } from "../src/backend";
import { EXAMPLE_STATE } from "../src/reference";
import { createFakeBackend } from "./fakeBackend";
import { seedExample } from "./seedExample";

// render_project draws a stored project with the renderer the web app passes
// in (lib/svg.ts there). These check what the tool hands it and who may call
// it; apps/web/test/mcpRender.test.ts checks the real renderer's output.

process.env.ARCHER_SERVICE_SECRET ??= "test-service-secret";

const { user, project, team } = EXAMPLE_STATE;
const calls: { source: string; theme: string }[] = [];
const renderSvg = (source: string, theme: "light" | "dark") => {
  calls.push({ source, theme });
  return `<svg xmlns="http://www.w3.org/2000/svg" data-theme="${theme}"></svg>`;
};

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
  calls.length = 0;
});

const connect = async (opts: { userId?: string; render?: boolean } = {}) => {
  const fake = createFakeBackend();
  seedExample(fake);
  Object.assign(db, fake.db);
  const mcp = await connectInProcess({
    userId: opts.userId ?? user,
    agentName: "test",
    renderSvg: opts.render === false ? undefined : renderSvg,
  });
  close = () => mcp.client.close();
  return { mcp, fake };
};

describe("render_project", () => {
  it("draws the stored source, light unless asked for dark", async () => {
    const { mcp, fake } = await connect();
    const stored = fake.state.projects.get(project.id)!.source;

    const light = await mcp.call("render_project", { project_id: project.id });
    expect(light.isError).toBe(false);
    expect(light.text).toBe('<svg xmlns="http://www.w3.org/2000/svg" data-theme="light"></svg>');

    const dark = await mcp.call("render_project", { project_id: project.id, theme: "dark" });
    expect(dark.text).toContain('data-theme="dark"');
    expect(calls).toEqual([
      { source: stored, theme: "light" },
      { source: stored, theme: "dark" },
    ]);
  });

  it("lets a viewer render a project in their current workspace", async () => {
    const { mcp, fake } = await connect({ userId: "user_viewer" });
    fake.state.teams.push({ id: "team_ro", name: "Read only", members: { user_viewer: "viewer" } });
    fake.state.projects.set("p_team", {
      ...fake.state.projects.get(project.id)!,
      _id: "p_team",
      workspaceId: "team_ro",
    });
    fake.state.prefs.set("user_viewer", "team_ro");

    const res = await mcp.call("render_project", { project_id: "p_team" });
    expect(res.isError, res.text).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("can't reach another user's project", async () => {
    const { mcp } = await connect({ userId: "user_stranger" });
    const res = await mcp.call("render_project", { project_id: project.id });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/No project with id/);
    expect(calls).toEqual([]);
  });

  it("says so when the host gave it no renderer", async () => {
    const { mcp } = await connect({ render: false });
    const res = await mcp.call("render_project", { project_id: project.id });
    expect(res.isError).toBe(true);
    expect(res.text).toBe("Rendering isn't available on this server.");
  });

  it("is refused without a verified user", async () => {
    const { mcp } = await connect();
    mcp.dropAuth();
    const res = await mcp.call("render_project", { project_id: project.id });
    expect(res.isError).toBe(true);
    expect(calls).toEqual([]);
  });

  // `team` is the example scenario's team, where the user is an editor.
  it("renders in a team workspace after use_workspace", async () => {
    const { mcp, fake } = await connect();
    fake.state.projects.set("p_acme", { ...fake.state.projects.get(project.id)!, _id: "p_acme", workspaceId: team.id });
    expect((await mcp.call("render_project", { project_id: "p_acme" })).isError).toBe(true);
    await mcp.call("use_workspace", { workspace_id: team.id });
    expect((await mcp.call("render_project", { project_id: "p_acme" })).isError).toBe(false);
  });
});
