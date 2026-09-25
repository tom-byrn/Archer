import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db, type MemberRow, type WorkspaceSummary } from "./backend";
import type { ArcherHost } from "./host";
import { caller, currentWorkspace, iso, text, wrap } from "./tool";

// Team workspaces and their members: the dashboard's workspace menu (New team
// workspace, Rename, Delete, Leave) and its Members dialog. The Convex
// functions enforce the roles: any member may look, owners manage.

const roleSchema = z.enum(["owner", "editor", "viewer"]);

const memberView = (m: MemberRow) => ({
  member_id: m._id,
  email: m.email,
  role: m.role,
  pending: m.pending,
  you: m.you,
  added: iso(m.createdAt),
});

export function registerTeamTools(server: McpServer, host: ArcherHost): void {
  /** A team workspace the user belongs to, or throw (Personal has no members to manage). */
  const team = async (serviceKey: string, workspaceId: string): Promise<WorkspaceSummary> => {
    const id = workspaceId.trim();
    const all = await db.listWorkspaces(serviceKey);
    const w = all.find((x) => x.id === id);
    if (!w)
      throw new Error(
        `The user is not a member of workspace '${id}'. Valid ids: ${all.map((x) => `${x.id} (${x.name})`).join(", ")}.`,
      );
    if (w.kind === "personal")
      throw new Error(
        "That's the user's Personal workspace: it's theirs alone and has no members, name or settings to change. Team workspaces do; create_workspace makes one.",
      );
    return w;
  };

  /** Owner-only actions: say so plainly before Convex refuses. */
  const requireOwner = (w: WorkspaceSummary, doing: string): void => {
    if (w.role !== "owner")
      throw new Error(`Only owners can ${doing}; the user is ${w.role === "editor" ? "an editor" : "a viewer"} in ${w.name}.`);
  };

  /** A member of the team, or throw. */
  const memberOf = async (serviceKey: string, workspaceId: string, memberId: string): Promise<MemberRow> => {
    const members = await db.listMembers(serviceKey, workspaceId);
    const m = members.find((x) => x._id === memberId.trim());
    if (!m) throw new Error(`No member '${memberId}' in this workspace. list_members shows their ids.`);
    return m;
  };

  /** A note when the workspace the agents act on just went away. */
  const wasCurrent = async (workspaceId: string) => {
    const now = await currentWorkspace(caller()).catch(() => null);
    return now?.workspaceId === workspaceId
      ? { note: "It was the current workspace: project tools now act on the user's Personal workspace." }
      : {};
  };

  server.registerTool(
    "create_workspace",
    {
      title: "Create a team workspace",
      description:
        "Create a team workspace, like New team workspace… in the app's workspace menu. The user becomes its owner and can invite people with invite_member. It does NOT become the current workspace: call use_workspace to work in it.",
      inputSchema: { name: z.string().min(1).max(100).describe("The workspace's name, e.g. the team's") },
    },
    wrap(async ({ name }) => {
      const { serviceKey, userId } = caller();
      const trimmed = name.trim();
      if (trimmed === "") throw new Error("The name can't be empty.");
      const email = await host.userEmail(userId).catch(() => null);
      const id = await db.createWorkspace(serviceKey, trimmed, email);
      return text({
        workspace_id: id,
        name: trimmed,
        kind: "team",
        role: "owner",
        current: false,
        note: "use_workspace switches to it; invite_member adds people.",
      });
    }),
  );

  server.registerTool(
    "rename_workspace",
    {
      title: "Rename a team workspace",
      description: "Rename a team workspace, like Rename… in the app's workspace menu. Owners only.",
      inputSchema: {
        workspace_id: z.string().min(1).describe("Team workspace id from list_workspaces"),
        name: z.string().min(1).max(100).describe("The new name"),
      },
    },
    wrap(async ({ workspace_id, name }) => {
      const { serviceKey } = caller();
      const w = await team(serviceKey, workspace_id);
      requireOwner(w, "rename a workspace");
      const trimmed = name.trim();
      if (trimmed === "") throw new Error("The name can't be empty.");
      await db.renameWorkspace(serviceKey, w.id, trimmed);
      return text({ workspace_id: w.id, name: trimmed, previous_name: w.name });
    }),
  );

  server.registerTool(
    "delete_workspace",
    {
      title: "Delete a team workspace",
      description:
        "Permanently delete a team workspace with every project, revision, drift report and custom type in it, like Delete workspace… in the app's workspace menu. Members lose access at once. Irreversible — there is no trash. Owners only. Requires confirm=true, and only call it when the user explicitly asked to delete this workspace.",
      inputSchema: {
        workspace_id: z.string().min(1).describe("Team workspace id from list_workspaces"),
        confirm: z.literal(true).describe("Must be true; acknowledges permanent deletion"),
      },
    },
    wrap(async ({ workspace_id }) => {
      const { serviceKey } = caller();
      const w = await team(serviceKey, workspace_id);
      requireOwner(w, "delete a workspace");
      const projects = await db.listProjects({ workspaceId: w.id, serviceKey }).catch(() => null);
      const note = await wasCurrent(w.id);
      await db.deleteWorkspace(serviceKey, w.id);
      return text({ deleted: w.id, name: w.name, projects_deleted: projects?.length ?? null, ...note });
    }),
  );

  server.registerTool(
    "leave_workspace",
    {
      title: "Leave a team workspace",
      description:
        "Take the user out of a team workspace, like Leave workspace in the app's workspace menu: they lose access to its projects until an owner invites them back. An owner can only leave once another signed-in owner exists. Requires confirm=true; only when the user asks.",
      inputSchema: {
        workspace_id: z.string().min(1).describe("Team workspace id from list_workspaces"),
        confirm: z.literal(true).describe("Must be true; acknowledges losing access"),
      },
    },
    wrap(async ({ workspace_id }) => {
      const { serviceKey } = caller();
      const w = await team(serviceKey, workspace_id);
      const note = await wasCurrent(w.id);
      await db.leaveWorkspace(serviceKey, w.id);
      return text({ left: w.id, name: w.name, ...note });
    }),
  );

  server.registerTool(
    "list_members",
    {
      title: "List a team workspace's members",
      description:
        "List the members of a team workspace and the invitations waiting for someone to sign in (`pending`), each with their role — the app's Members dialog. `you` marks the user. Owners manage members, editors change projects, viewers only read. Any member may look.",
      inputSchema: { workspace_id: z.string().min(1).describe("Team workspace id from list_workspaces") },
    },
    wrap(async ({ workspace_id }) => {
      const { serviceKey } = caller();
      const w = await team(serviceKey, workspace_id);
      const members = await db.listMembers(serviceKey, w.id);
      return text({ workspace_id: w.id, name: w.name, your_role: w.role, members: members.map(memberView) });
    }),
  );

  server.registerTool(
    "invite_member",
    {
      title: "Invite someone to a team workspace",
      description:
        "Give someone access to a team workspace by email, with a role — the Members dialog's Invite. They get access when they sign in to Archer with GitHub using that address (at once if they already have). Archer sends no email, so tell the user to let them know. Inviting an address that's already a member or invited changes its role instead. Owners only; only invite people the user named.",
      inputSchema: {
        workspace_id: z.string().min(1).describe("Team workspace id from list_workspaces"),
        email: z.string().min(3).describe("Their email address"),
        role: roleSchema.optional().describe("owner: manages members; editor: changes projects (default); viewer: reads only"),
      },
    },
    wrap(async ({ workspace_id, email, role }) => {
      const { serviceKey } = caller();
      const w = await team(serviceKey, workspace_id);
      requireOwner(w, "invite people");
      const addr = email.trim().toLowerCase();
      const r = role ?? "editor";
      const before = (await db.listMembers(serviceKey, w.id)).find((m) => m.email === addr);
      const memberId = await db.inviteMember(serviceKey, w.id, addr, r);
      const row = (await db.listMembers(serviceKey, w.id)).find((m) => m._id === memberId);
      const pending = row?.pending ?? true;
      return text({
        workspace_id: w.id,
        member_id: memberId,
        email: addr,
        role: r,
        pending,
        note: before
          ? `${addr} was already ${before.pending ? "invited" : "a member"}: their role is now ${r}.`
          : `${w.name} appears for ${addr} when they sign in to Archer with GitHub using that address. Archer doesn't email them: let them know.`,
      });
    }),
  );

  server.registerTool(
    "set_member_role",
    {
      title: "Change a member's role",
      description:
        "Change the role of a member (or a pending invitation) of a team workspace — the role menu in the Members dialog. A workspace keeps at least one signed-in owner, so the last one can't be demoted. Owners only.",
      inputSchema: {
        workspace_id: z.string().min(1).describe("Team workspace id from list_workspaces"),
        member_id: z.string().min(1).describe("From list_members"),
        role: roleSchema.describe("owner: manages members; editor: changes projects; viewer: reads only"),
      },
    },
    wrap(async ({ workspace_id, member_id, role }) => {
      const { serviceKey } = caller();
      const w = await team(serviceKey, workspace_id);
      requireOwner(w, "change roles");
      const m = await memberOf(serviceKey, w.id, member_id);
      if (m.role !== role) await db.setMemberRole(serviceKey, m._id, role);
      return text({ workspace_id: w.id, member_id: m._id, email: m.email, role, previous_role: m.role });
    }),
  );

  server.registerTool(
    "remove_member",
    {
      title: "Remove a member from a team workspace",
      description:
        "Take someone out of a team workspace, or withdraw their pending invitation — the trash button in the Members dialog. They lose access at once. The last signed-in owner can't be removed. Owners only. Requires confirm=true; only when the user asks. (To remove the user themselves, use leave_workspace.)",
      inputSchema: {
        workspace_id: z.string().min(1).describe("Team workspace id from list_workspaces"),
        member_id: z.string().min(1).describe("From list_members"),
        confirm: z.literal(true).describe("Must be true; acknowledges removing their access"),
      },
    },
    wrap(async ({ workspace_id, member_id }) => {
      const { serviceKey } = caller();
      const w = await team(serviceKey, workspace_id);
      requireOwner(w, "remove members");
      const m = await memberOf(serviceKey, w.id, member_id);
      await db.removeMember(serviceKey, m._id);
      return text({ workspace_id: w.id, removed: m._id, email: m.email, role: m.role, pending: m.pending });
    }),
  );
}
