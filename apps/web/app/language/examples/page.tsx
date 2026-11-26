import { Fragment } from "react";
import { VIEW_LABELS, allViews, parse, viewName, type ViewRef } from "@archer/lang";
import { EXAMPLES, type Example } from "@archer/mcp/examples";
import { DocsNav } from "@/components/docs/DocsNav";
import { OpenExampleLink, ViewCodeButton } from "@/components/docs/ExampleActions";
import { SiteFrame } from "@/components/landing/SiteFrame";
import { highlightArch } from "@/lib/highlightArch";
import { renderArchSvg } from "@/lib/svg";
import { renderViewSvg } from "@/lib/viewSvg";

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

/** An SVG's natural size, so the page doesn't shift while it loads. */
const svgSize = (svg: string): { width: number; height: number } => {
  const m = /width="(\d+)" height="(\d+)"/.exec(svg);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 800, height: 400 };
};

/** Each theme's diagram, and the class that shows it in that theme only (globals.css). */
const DIAGRAM_THEMES = [
  { theme: "light", only: "theme-light-only" },
  { theme: "dark", only: "theme-dark-only" },
] as const;

function Diagram({ example }: { example: Example }) {
  return (
    <Figure
      base={`/language/examples/${example.slug}`}
      size={svgSize(renderArchSvg(example.source, { showTitle: false }))}
      alt={`The ${example.title} document as Archer draws it`}
    />
  );
}

/** One image per theme, of which globals.css shows the page's. */
function Figure({ base, size, alt }: { base: string; size: { width: number; height: number }; alt: string }) {
  const { width, height } = size;
  return (
    <figure className="overflow-x-auto border border-line bg-ground">
      {DIAGRAM_THEMES.map(({ theme, only }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={theme}
          src={`${base}/${theme}.svg`}
          alt={alt}
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

/** Each of the example's views (spec §6), drawn below its architecture. */
function Views({ example }: { example: Example }) {
  const views: ViewRef[] = allViews(parse(example.source).doc);
  if (views.length === 0) return null;
  return (
    <div className="flex flex-col gap-6 pt-8">
      {views.map((v) => (
        <div key={v.node.id}>
          <p className="flex items-baseline gap-2 pb-2 text-[14px]">
            <span className="font-semibold text-ink">{viewName(v.node)}</span>
            <span className="mono text-xs uppercase tracking-[0.08em] text-ink-3">
              {VIEW_LABELS[v.kind].one} · {v.node.id}
            </span>
          </p>
          <Figure
            base={`/language/examples/${example.slug}/views/${v.node.id}`}
            size={svgSize(renderViewSvg(example.source, v.node.id, { showTitle: false }))}
            alt={`The ${viewName(v.node)} ${VIEW_LABELS[v.kind].one} of the ${example.title} document`}
          />
        </div>
      ))}
    </div>
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
            Most have no <code className={inlineCode}>layout</code> block. That is how agents
            write Archer, and those diagrams are the app&apos;s auto-layout. Examples with{" "}
            <a href="#sequences" className="font-medium text-ink hover:underline">
              views
            </a>{" "}
            (sequences, flows, state machines and data models) show each one below the
            architecture, drawn from the same file. The last example is a whole product laid out
            by hand, so it shows what the canvas writes once you arrange things yourself.
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
          <Views example={e} />
        </section>
      ))}
    </SiteFrame>
  );
}
