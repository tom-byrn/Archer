// JSON results of the tools the CLI calls over /mcp (the text content of a
// successful call, parsed). server.ts builds each one with `satisfies`, so a
// shape change breaks the build instead of the CLI. Types only.

export type Role = "owner" | "editor" | "viewer";

export interface ProjectListItem {
  id: string;
  title: string;
  /** ISO timestamp */
  updated: string;
  editor_url: string;
}

export interface ProjectRead {
  id: string;
  title: string;
  editor_url: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  drift: { reported_at: string; findings_count: number } | null;
  repository: {
    full_name: string;
    branch: string;
    url: string;
    hint: string;
    /** Set when the project is stored in this .arch file (the source of truth). */
    path?: string;
    /** Repo sync state, for a project stored in a file. */
    sync?: {
      /** Commit of the file version the project is based on; null before the file exists. */
      base_commit: string | null;
      /** The project has changes not yet published to the file. */
      unpublished_changes: boolean;
      /** Open pull request from the last publish. */
      pull_request: string | null;
      /** The file changed on the branch in ways that conflict with the draft. */
      conflict: boolean;
    };
  } | null;
  source: string;
}

export interface ProjectCreated {
  id: string;
  title: string;
  editor_url: string;
  warnings: string[];
  /** How the diagram will read (`readabilityAdvice`): never blocks, worth acting on. */
  advice: string[];
}

export interface ProjectUpdated extends ProjectCreated {
  saved: true;
  attributed_to: string;
  /** Set when the project is stored in a repository file: the write went to its draft. */
  note?: string;
}

/** The error result of create_project / update_project when validation fails. */
export interface WriteRejected {
  message: string;
  errors: string[];
  warnings: string[];
}

export interface TypeList {
  catalog: { tag: string; name: string; namespace: string }[];
  custom_types: { tag: string; name: string; color: string; glyph: string }[];
  connection_types: readonly string[];
  glyphs_for_custom_types: string[];
  note?: string;
}

export interface WorkspaceInfo {
  auth: "oauth";
  user_id: string;
  workspace_id: string;
  workspace_name: string | null;
  workspace_role: string | null;
  agent_name: string;
  convex_url: string;
  app_url: string;
  backend_reachable: boolean;
  project_count: number | null;
  custom_type_count: number | null;
}

export interface WorkspaceList {
  current_workspace_id: string;
  workspaces: { id: string; name: string; kind: "personal" | "team"; role: Role; current: boolean }[];
}

export interface WorkspaceSwitched {
  current_workspace_id: string;
  name: string;
  kind: "personal" | "team";
  role: Role;
  visible_projects: number | null;
  note?: string;
}
