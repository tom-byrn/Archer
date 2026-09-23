import { Fragment } from "react";
import { DocsNav } from "@/components/docs/DocsNav";
import { OpenExampleLink, ViewCodeButton } from "@/components/docs/ExampleActions";
import { SiteFrame } from "@/components/landing/SiteFrame";
import { EXAMPLES, type Example } from "@/lib/examples";
import { highlightArch } from "@/lib/highlightArch";
import { renderArchSvg } from "@/lib/svg";

export const metadata = { title: "Examples · Archer" };

const inlineCode = "mono rounded-xs bg-surface-2 px-1 py-0.5 text-[12.5px] text-ink";

/** Summary text with `backtick` spans set as code. */
const withCode = (text: string) =>
  text.split(/`([^`]+)`/).map((part, i) =>
    i % 2 === 1 ? (
      <code key={i} className={inlineCode}>
        {part}
      </code>
    ) : (
      part
    ),
  );

/** The diagram's natural size, so the page doesn't shift while it loads. */
const imageSize = (source: string): { width: number; height: number } => {
  const m = /width="(\d+)" height="(\d+)"/.exec(renderArchSvg(source, { showTitle: false }));
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 800, height: 400 };
};

/** Each theme's diagram, and the class that shows it in that theme only (globals.css). */
const DIAGRAM_THEMES = [
  { theme: "light", only: "theme-light-only" },
  { theme: "dark", only: "theme-dark-only" },
] as const;

function Diagram({ example }: { example: Example }) {
  const { width, height } = imageSize(example.source);
  const base = `/language/examples/${example.slug}`;
  return (
    <figure className="overflow-x-auto border border-line bg-ground">
      {DIAGRAM_THEMES.map(({ theme, only }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={theme}
          src={`${base}/${theme}.svg`}
          alt={`The ${example.title} document as Archer draws it`}
          width={width}
          height={height}
          // Lazy, so the other theme's image (display: none) is never fetched.
          loading="lazy"
          // Scale down to fit, but scroll rather than shrink past legibility.
          style={{ width: "100%", maxWidth: width, minWidth: Math.min(width, 640), height: "auto" }}
          className={`${only} mx-auto block`}
        />
      ))}
    </figure>
  );
}

/**
 * The source as the editor's code view draws it, for the "View code" popout:
 * line numbers in a gutter that stays put while the code scrolls sideways.
 */
function Source({ source }: { source: string }) {
  const lines = highlightArch(source);
  return (
    <div className="flex min-w-max text-sm leading-[1.6]">
      <div
        aria-hidden
        className="mono sticky left-0 select-none py-2 pl-1 text-right"
        style={{ background: "var(--code-bg)", color: "var(--code-gutter)" }}
      >
        {lines.map((_, i) => (
          <div key={i} className="min-w-7 pr-1.5">
            {i + 1}
          </div>
        ))}
      </div>
      <pre className="mono py-2 pl-6 pr-3" style={{ color: "var(--code-fg)" }}>
        <code>
          {lines.map((tokens, i) => (
            <Fragment key={i}>
              {i > 0 && "\n"}
              {tokens.map((t, j) =>
                t.className ? (
                  <span key={j} className={t.className}>
                    {t.text}
                  </span>
                ) : (
                  t.text
                ),
              )}
            </Fragment>
          ))}
        </code>
      </pre>
    </div>
  );
}

export default function ExamplesPage() {
  return (
    <SiteFrame>
      <DocsNav active="examples" />

      <section className="landing-joints border-b border-line px-5 py-12 sm:px-10 sm:py-16">
        <div className="max-w-3xl">
          <h1 className="pb-3 text-2xl font-bold tracking-tight text-ink">Examples</h1>
          <p className="pb-3 text-[14px] leading-relaxed text-ink-2">
            Each example is a complete <code className={inlineCode}>.arch</code> document, shown
            as the diagram Archer draws from it. Nothing is drawn by hand: the images come from
            the same renderer as share links and README embeds, straight from the source.{" "}
            <strong className="text-ink">View code</strong> shows that source, and{" "}
            <strong className="text-ink">Open in sandbox</strong> loads it into the editor to
            change however you like, no account needed. Nothing there is saved.
          </p>
          <p className="pb-3 text-[14px] leading-relaxed text-ink-2">
            The first two have no <code className={inlineCode}>layout</code> block. That is how
            agents write Archer, and those diagrams are the app&apos;s auto-layout. The last one is
            a whole product laid out by hand, so it shows what the canvas writes once you arrange
            things yourself.
          </p>
          <ol className="pt-3">
            {EXAMPLES.map((e, i) => (
              <li key={e.slug} className="flex gap-3 pb-1.5 text-[14px] leading-relaxed">
                <span className="mono w-4 shrink-0 text-ink-3">{i + 1}</span>
                <span>
                  <a href={`#${e.slug}`} className="font-medium text-ink hover:underline">
                    {e.title}
                  </a>
                  <span className="text-ink-3"> · {e.features.join(", ")}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {EXAMPLES.map((e, i) => (
        <section
          key={e.slug}
          id={e.slug}
          className={`px-5 py-12 sm:px-10 sm:py-14 ${
            i < EXAMPLES.length - 1 ? "landing-joints border-b border-line" : ""
          }`}
        >
          <div className="flex flex-wrap items-start gap-x-8 gap-y-4 pb-6">
            <div className="min-w-0 max-w-3xl flex-1 basis-[28rem]">
              <h2 className="text-xl font-bold tracking-tight text-ink">
                <a href={`#${e.slug}`} className="hover:underline">
                  {e.title}
                </a>
              </h2>
              <p className="pt-2 text-[14px] leading-relaxed text-ink-2">{withCode(e.summary)}</p>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <ViewCodeButton title={e.title} source={e.source}>
                <Source source={e.source} />
              </ViewCodeButton>
              <OpenExampleLink slug={e.slug} />
            </div>
          </div>
          <Diagram example={e} />
        </section>
      ))}
    </SiteFrame>
  );
}
