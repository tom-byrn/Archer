import Link from "next/link";
import type { ReactNode } from "react";

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Do I need an account to try it?",
    a: (
      <>
        No. You can go to the example{" "}
        <Link
          href="/language/examples"
          className="underline underline-offset-2 hover:text-ink"
        >
          sandboxes
        </Link>{" "}
        to try it out. But you will need to create an account to connect your
        agent.
      </>
    ),
  },
  {
    q: "Which agents work with it?",
    a: "Any MCP client, through the hosted server: Claude Code, Cursor, Codex and more. Agents without MCP can read the language reference and write the file themselves.",
  },
  {
    q: "What does my agent actually get?",
    a: "The whole document, layout block included, plus a short reading guide: every component, what it does, where it lives in the code, how it connects and where it sits on your canvas.",
  },
  {
    q: "Can I start from an existing codebase?",
    a: "Yes. Give your coding agent the prompt at the top of this page and it maps the repo into an Archer document. With the MCP server connected, it can create the project for you.",
  },
  {
    q: "What if my agent gets it wrong?",
    a: "Agent writes go through the same validation as the canvas, so a broken document is rejected, not saved. Agent edits are badged until you review them, and every revision is kept.",
  },
  {
    q: "Can I use my own components?",
    a: "Yes. Add a custom type with its own name, glyph and color. It appears in the palette and validates in every project in the workspace.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="landing-joints border-b border-line">
      <div className="px-5 pt-16 text-center sm:px-10 sm:pt-20">
        <h2 className="landing-headline text-display-sm text-ink sm:text-display-md">
          Frequently Asked Questions
        </h2>
      </div>
      {/* The 1px gaps over a line-colored background draw the rules between answers. */}
      <dl className="mt-12 grid gap-px border-t border-line bg-line md:grid-cols-2 lg:grid-cols-3">
        {FAQ.map(({ q, a }) => (
          <div key={q} className="bg-bg px-5 py-7 sm:px-10 sm:py-8">
            <dt className="text-lg font-semibold text-ink">{q}</dt>
            <dd className="pt-2 text-base text-ink-2">{a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
