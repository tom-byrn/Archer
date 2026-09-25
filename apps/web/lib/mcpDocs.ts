import { TOOL_REFERENCE_SLOT } from "@archer/mcp/docs";
import { describeServer } from "@archer/mcp/reference";
import { buildReference, type Reference } from "@archer/mcp/toolReference";
import { createSlugger, readDoc, renderDocs, type TocEntry } from "./docs";

export interface McpDocs {
  /** The file up to the tool reference, as HTML. */
  intro: string;
  reference: Reference;
  /** The file after it. */
  outro: string;
  toc: TocEntry[];
}

/** /docs/mcp: docs/mcp.md with the tool reference generated from the server in the middle. */
export async function loadMcpDocs(): Promise<McpDocs> {
  const [before, after] = readDoc("mcp").split(TOOL_REFERENCE_SLOT);
  if (after === undefined) throw new Error("docs/mcp.md has lost its <!-- tools:start --> … <!-- tools:end --> markers.");
  // One slugger for the whole page, so the generated headings' ids can't clash with the file's.
  const slug = createSlugger();
  const intro = renderDocs(before!, slug);
  const reference = buildReference(await describeServer(), slug);
  const outro = renderDocs(after, slug);
  return { intro: intro.html, reference, outro: outro.html, toc: [...intro.toc, ...outro.toc] };
}
