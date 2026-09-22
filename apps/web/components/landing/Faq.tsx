import Link from "next/link";

const FAQ: { q: string; a: string }[] = [
  {
    q: "Do I need an account to try it?",
    a: "No. The sandbox on this page is the real canvas, running in your browser. Nothing is saved until you sign in with GitHub.",
  },
  {
    q: "Which agents work with it?",
    a: "Any MCP client, through the hosted server: Claude Code, Cursor, Codex and more. Agents without MCP can read the language reference and write the file themselves.",
  },
  {
    q: "What does my agent actually get?",
    a: "The document without its layout block, plus a short reading guide: every component, what it does, where it lives in the code and how it connects.",
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
      <div className="grid items-end gap-x-14 gap-y-5 px-5 pt-16 sm:px-10 sm:pt-20 lg:grid-cols-2">
        <div>
          <p className="mono text-sm uppercase tracking-[0.08em] text-accent">FAQ</p>
          <h2 className="landing-headline pt-4 text-display-sm text-ink sm:text-display-md">
            Questions, answered.
          </h2>
        </div>
        <p className="max-w-[46ch] text-lg text-ink-2">
          Anything else is probably in the{" "}
          <Link
            href="/language"
            className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-current"
          >
            language reference
          </Link>
          . It&apos;s one page, written so an agent can read it in a single pass.
        </p>
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
