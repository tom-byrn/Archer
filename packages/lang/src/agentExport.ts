import { format } from "./format";
import { normalizeLayout } from "./validate";
import type { ArchDoc } from "./types";

const PREAMBLE = `# This is an Archer architecture document — a complete, machine-readable
# specification of a software system, exported from a canvas the author designed.
# Treat it as the source of truth for the system's intended architecture.
#
# How to read it:
# - \`component <id> "Display Name" @type { ... }\` declares a part of the system.
#   Components nest; a child lives inside its parent. \`@type\` tags a real
#   technology (e.g. @aws.s3, @postgres); untyped components are logical parts.
# - \`desc\` is the author's human-readable intent for that component.
# - Named payload blocks (json | yaml | table | markdown) carry structured detail
#   such as schemas, endpoint lists, or env vars. json/yaml/table payloads are
#   syntactically validated — trust them as authored data.
# - \`a.b -> c.d @type : "label"\` declares a connection between two components,
#   referenced by dot-path. \`->\` directed, \`<->\` bidirectional, \`--\` undirected.
# - When implementing, honor every component, connection, and payload. Ask about
#   gaps rather than inventing architecture that contradicts this document.
# - If you write Archer back, follow the grammar above and NEVER emit a
#   \`layout\` block — layout is machine-managed presentation, not architecture.
`;

/**
 * "Copy for agent": canonical text, layout stripped, preamble prepended.
 * Callers should refuse to export documents with validation errors.
 */
export function compileForAgent(doc: ArchDoc): string {
  return `${PREAMBLE}\n${format(normalizeLayout(doc), { stripLayout: true })}`;
}
