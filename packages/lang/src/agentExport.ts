import { format } from "./format";
import { autoLayout } from "./layout";
import type { ArchDoc } from "./types";

const PREAMBLE = `# This is an Archer architecture document — a complete, machine-readable
# specification of a software system, exported from a canvas the author designed.
# Treat it as the source of truth for the system's intended architecture.
#
# How to read it:
# - \`component <id> "Display Name" @type { ... }\` declares a part of the system.
#   Components nest: one declared inside another is part of it (the canvas
#   shows it when you open its parent). \`@type\` tags a real technology (e.g.
#   @aws.s3, @postgres); untyped components are logical parts.
# - \`plane <id> "Name" @type { ... }\` groups the components declared in it:
#   a tier (frontend, backend), a network, a team's area. It organizes the
#   picture and isn't itself a part to build: paths skip planes, and no
#   connection ends on one.
# - \`desc\` is the author's human-readable intent for that component.
# - \`src\` points at where the component lives in code: a repo path (a file or
#   a folder) or a URL, one \`src\` line per place when it spans several.
#   Start there when implementing or verifying that component.
# - \`shape\` (cylinder, cloud, person, robot, …) is how the canvas draws a
#   component: a hint at what it is (a store, an outside service, a user, an
#   agent), never an instruction for how to build it.
# - Named payload blocks (json | yaml | table | markdown) carry structured detail
#   such as schemas, endpoint lists, or env vars. json/yaml/table payloads are
#   syntactically validated — trust them as authored data.
# - \`a.b -> c.d @type : "label"\` declares a connection between two components,
#   referenced by dot-path through the components they're nested in.
#   \`->\` directed, \`<->\` bidirectional, \`--\` undirected.
#   A connection may carry its own payload blocks in a \`{ ... }\` body — the
#   message schema on a queue, the request shape on an API call. Implement the
#   edge exactly as those payloads describe it.
# - The closing \`layout { ... }\` block is where each component and plane
#   sits on the author's canvas: \`path: { at: [col, row], size: [w, h] }\` on
#   an integer grid. The top level and the inside of each component are
#   separate canvases, and an \`at\` is relative to the plane the item sits
#   on. It is presentation, not architecture — nothing to implement — but it
#   shows how the author sees the system: what sits side by side, what flows
#   left to right, what they grouped together.
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
