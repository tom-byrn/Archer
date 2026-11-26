/**
 * The landing page's views showcase (components/landing/Views.tsx), built on
 * the server from the docs examples: each view's own source, highlighted, and
 * its diagram in both themes. Drawn without logos, like the rest of the
 * landing page, and straight from the examples, so it can't drift from them.
 */

import { findExample } from "@archer/mcp/examples";
import { highlightArch, type HighlightToken } from "./highlightArch";
import { renderViewSvg } from "./viewSvg";

export interface LandingView {
  key: string;
  label: string;
  title: string;
  blurb: string;
  code: HighlightToken[][];
  light: string;
  dark: string;
  /** The worked example it comes from, on /language/examples. */
  href: string;
}

const SHOWCASE = [
  {
    label: "Sequence",
    example: "sequences",
    view: "resolve",
    title: "Who calls whom, in order",
    blurb:
      "Calls, replies and async messages between your components, with alt, opt, loop and par. Every call has to travel on a real connection, and the editor plays it back on the canvas.",
  },
  {
    label: "Flow",
    example: "flows-states-and-data",
    view: "publish",
    title: "A process, lane by lane",
    blurb: "Steps and decisions in one lane per component that does them. Play it on the architecture to light up each step's owner.",
  },
  {
    label: "State machine",
    example: "ride-hailing",
    view: "trip",
    title: "The states a component moves through",
    blurb: "An initial state, final ones and the events between them. Step through it in the simulator.",
  },
  {
    label: "Data model",
    example: "flows-states-and-data",
    view: "schema",
    title: "What a store holds",
    blurb: "Entities, fields and references on a database component, drawn as tables joined by crow's-foot lines.",
  },
] as const;

/** The `<kind> <id> …{ … }` block of one view, as written in the source. */
function viewSource(source: string, id: string): string {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^(sequence|flow|states|entities) ${id}\\b`).test(l));
  if (start < 0) throw new Error(`No view '${id}'`);
  const end = lines.findIndex((l, i) => i > start && l === "}");
  return lines.slice(start, end + 1).join("\n");
}

export function landingViews(): LandingView[] {
  return SHOWCASE.map((s) => {
    const example = findExample(s.example);
    if (!example) throw new Error(`No example '${s.example}'`);
    const draw = (theme: "light" | "dark") =>
      renderViewSvg(example.source, s.view, { theme, showTitle: false, background: false });
    return {
      key: s.view,
      label: s.label,
      title: s.title,
      blurb: s.blurb,
      code: highlightArch(viewSource(example.source, s.view)),
      light: draw("light"),
      dark: draw("dark"),
      href: `/language/examples#${s.example}`,
    };
  });
}
