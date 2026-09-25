import { fenced, type Slugger } from "./markdown";
import { ACCESS_LABELS, TOOL_DOCS, TOOL_GROUPS, type ServerDescription } from "./reference";

// The MCP tool reference on /docs/mcp, as data: what the server lists about
// each tool (title, description, input schema), joined with the examples in
// reference.ts. The site draws it (apps/web/components/docs/ToolReference.tsx)
// and referenceMarkdown writes the same thing for agents (docs.ts).

interface JsonSchema {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  description?: string;
}

export interface Param {
  /** Dotted for nested fields: `repository.branch`, `findings[].status`. */
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface CodeBlock {
  /** What the block shows, when it isn't the whole example (a long string argument). */
  label?: string;
  /** `arch` is Archer source, which the page highlights. */
  lang: "json" | "arch" | "text";
  code: string;
}

export interface ToolEntry {
  id: string;
  name: string;
  title: string;
  access: string;
  /** The description the agent reads, in paragraphs. */
  description: string[];
  params: Param[];
  call: CodeBlock[];
  result: CodeBlock;
  /** Markdown. */
  notes: string[];
}

export interface GroupEntry {
  id: string;
  title: string;
  /** Markdown. */
  intro: string;
  tools: ToolEntry[];
}

export interface ResourceEntry {
  uri: string;
  title: string;
  mimeType: string;
  description: string;
}

export interface Reference {
  /** The server's own version (its MCP serverInfo). */
  version: string;
  toolCount: number;
  groups: GroupEntry[];
  resourcesId: string;
  resources: ResourceEntry[];
}

/** A schema as a short type: `string`, `"plane" | "icon"`, `object[]`, `object | null`. */
function typeOf(s: JsonSchema): string {
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (s.anyOf) return s.anyOf.map(typeOf).join(" | ");
  if (s.type === "array") return `${s.items ? typeOf(s.items) : "any"}[]`;
  return Array.isArray(s.type) ? s.type.join(" | ") : (s.type ?? "any");
}

/** Limits the schema puts on a value, as a sentence. */
function limits(s: JsonSchema): string {
  const out: string[] = [];
  if (s.minimum !== undefined && s.maximum !== undefined) out.push(`From ${s.minimum} to ${s.maximum}.`);
  else if (s.minimum !== undefined) out.push(`At least ${s.minimum}.`);
  else if (s.maximum !== undefined) out.push(`At most ${s.maximum}.`);
  if (s.minLength === 1) out.push("Not empty.");
  else if (s.minLength !== undefined) out.push(`At least ${s.minLength} characters.`);
  if (s.maxLength !== undefined) out.push(`At most ${s.maxLength} characters.`);
  return out.join(" ");
}

const sentence = (text: string | undefined) => {
  const t = (text ?? "").trim();
  return t === "" || /[.!?)]$/.test(t) ? t : `${t}.`;
};

/** An object schema's fields as parameter rows, with nested objects' fields after their parent. */
function paramsOf(schema: JsonSchema, prefix = ""): Param[] {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).flatMap(([key, s]) => {
    const name = `${prefix}${key}`;
    const row: Param = {
      name,
      type: typeOf(s),
      required: required.has(key),
      description: [sentence(s.description), limits(s)].filter(Boolean).join(" "),
    };
    const object = s.properties ? s : s.anyOf?.find((o) => o.properties);
    const nested =
      s.type === "array" && s.items?.properties
        ? paramsOf(s.items, `${name}[].`)
        : object
          ? paramsOf(object, `${name}.`)
          : [];
    return [row, ...nested];
  });
}

/** JSON for display, with the docs' `"…"` placeholders shown as a bare ellipsis. */
const showJson = (value: unknown) => JSON.stringify(value, null, 2).replace(/"…"/g, "…");

/** Text is Archer source when it has an `arch` header line (compile_for_agent's comes after a preamble). */
const textLang = (text: string): CodeBlock["lang"] => (/^arch "/m.test(text) ? "arch" : "text");

/**
 * An example call. Multi-line strings (documents) read better as themselves
 * than as escaped JSON, so each gets its own block and the JSON says where.
 */
function callBlocks(args: Record<string, unknown>): CodeBlock[] {
  const long = Object.entries(args).filter(([, v]) => typeof v === "string" && v.includes("\n"));
  const inline = Object.fromEntries(
    Object.entries(args).map(([k, v]) => [k, long.some(([l]) => l === k) ? `<${k} below>` : v]),
  );
  return [
    { lang: "json", code: showJson(inline).replace(/"<(\w+) below>"/g, "<$1 below>") },
    ...long.map(([k, v]): CodeBlock => ({ label: k, lang: textLang(String(v)), code: String(v) })),
  ];
}

/**
 * The reference for a server description. `slug` gives the headings their
 * ids: pass the one that numbered the page's other headings, so they can't
 * clash.
 */
export function buildReference(server: ServerDescription, slug: Slugger): Reference {
  const tools = new Map(server.tools.map((t) => [t.name, t]));
  const groups = TOOL_GROUPS.map((group): GroupEntry => ({
    id: slug(group.title),
    title: group.title,
    intro: group.intro,
    tools: group.tools.map((name): ToolEntry => {
      const tool = tools.get(name);
      const doc = TOOL_DOCS[name];
      if (!tool || !doc) throw new Error(`Tool reference: ${name} is in TOOL_GROUPS but not registered or documented.`);
      return {
        id: slug(name),
        name,
        title: tool.title ?? name,
        access: ACCESS_LABELS[doc.access],
        description: (tool.description ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
        params: paramsOf(tool.inputSchema as JsonSchema),
        call: callBlocks(doc.args),
        result:
          typeof doc.result === "string"
            ? { lang: textLang(doc.result), code: doc.result }
            : { lang: "json", code: showJson(doc.result) },
        notes: doc.notes ?? [],
      };
    }),
  }));
  return {
    version: server.version,
    toolCount: server.tools.length,
    groups,
    resourcesId: slug("Resources"),
    resources: server.resources.map((r) => ({
      uri: r.uri,
      title: r.title ?? r.name,
      mimeType: r.mimeType ?? "",
      description: r.description ?? "",
    })),
  };
}

/** The reference's opening paragraph, in markdown. */
export const referenceIntro = (r: Reference): string =>
  `This part of the page is generated from the server itself (version ${r.version}, ${r.toolCount} tools). Each tool's title, description and parameters are what your agent reads when it lists the tools, so the descriptions speak to the agent. Every tool has an example call and its result, all in one scenario: you have a Personal workspace and are an editor in the team workspace Acme, and **Shop** is a project that Claude Code created and you then edited on the canvas.`;

/** What the Resources section says before listing them, in markdown. */
export const RESOURCES_INTRO =
  "Clients that support MCP resources can read the guide, the docs and the worked examples directly, without a tool call.";

const codeMarkdown = (block: CodeBlock): string =>
  `${block.label ? `\`${block.label}\`:\n\n` : ""}${fenced(block.code, block.lang)}`;

function toolMarkdown(tool: ToolEntry): string[] {
  const out = [`#### \`${tool.name}\``, `**${tool.title}** · ${tool.access}`, ...tool.description];
  if (tool.params.length === 0) out.push("No parameters.");
  else
    out.push(
      "Parameters:",
      tool.params
        .map(
          (p) =>
            `- \`${p.name}\` (\`${p.type}\`${p.required ? ", required" : ""})${p.description ? `: ${p.description}` : ""}`,
        )
        .join("\n"),
      "Example call:",
      ...tool.call.map(codeMarkdown),
    );
  out.push(tool.params.length === 0 ? "Example result:" : "Result:", codeMarkdown(tool.result));
  if (tool.notes.length > 0) out.push(tool.notes.map((note) => `- ${note}`).join("\n"));
  return out;
}

/** The reference in markdown: the same sections, in the same order, as the page draws it. */
export function referenceMarkdown(r: Reference): string {
  return [
    referenceIntro(r),
    [
      "| Group | Tools |",
      "| --- | --- |",
      ...r.groups.map(
        (g) => `| [${g.title}](#${g.id}) | ${g.tools.map((t) => `[\`${t.name}\`](#${t.id})`).join(" · ")} |`,
      ),
    ].join("\n"),
    ...r.groups.flatMap((g) => [`### ${g.title}`, g.intro, ...g.tools.flatMap(toolMarkdown)]),
    "### Resources",
    RESOURCES_INTRO,
    r.resources.map((res) => `- \`${res.uri}\` (${res.mimeType}): **${res.title}.** ${res.description}`).join("\n"),
  ].join("\n\n");
}
