import { format } from "./format";
import { autoLayout } from "./layout";
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
# - \`src\` points at where the component lives in code (a repo path or URL).
#   Start there when implementing or verifying that component.
# - \`shape\` (cylinder, cloud, person, robot, …) is how the canvas draws a
#   component: a hint at what it is (a store, an outside service, a user, an
#   agent), never an instruction for how to build it.
# - Named payload blocks (json | yaml | table | markdown) carry structured detail
#   such as schemas, endpoint lists, or env vars. json/yaml/table payloads are
#   syntactically validated — trust them as authored data.
# - \`a.b -> c.d @type : "label"\` declares a connection between two components,
#   referenced by dot-path. \`->\` directed, \`<->\` bidirectional, \`--\` undirected.
#   A connection may carry its own payload blocks in a \`{ ... }\` body — the
#   message schema on a queue, the request shape on an API call. Implement the
#   edge exactly as those payloads describe it.
# - The closing \`layout { ... }\` block is where each component sits on the
#   author's canvas: \`path: { at: [col, row], size: [w, h] }\` on an integer
#   grid, nested components relative to their parent, and \`display: plane\`
#   (drawn open, children visible) or \`display: icon\` (collapsed) for
#   containers. It is presentation, not architecture — nothing to implement —
#   but it shows how the author sees the system: what sits side by side, what
#   flows left to right, what they kept open or tucked away.
# - When implementing, honor every component, connection, and payload. Ask about
#   gaps rather than inventing architecture that contradicts this document.
# - If you write Archer back, follow the grammar above and leave the \`layout\`
#   block out: Archer keeps every surviving component where it was and places
#   new ones itself. Only write layout when asked to arrange the diagram.
`;

/**
 * "Copy for agent": canonical text with a complete layout block (every
 * component placed, as the canvas draws it), preamble prepended.
 * Callers should refuse to export documents with validation errors.
 */
export function compileForAgent(doc: ArchDoc): string {
  return `${PREAMBLE}\n${format(autoLayout(doc))}`;
}
