import { Fragment } from "react";
import { DocsNav } from "@/components/docs/DocsNav";
import { CopySourceButton, OpenExampleLink } from "@/components/docs/ExampleActions";
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

function Diagram({ example }: { example: Example }) {
  const { width, height } = imageSize(example.source);
  const base = `/language/examples/${example.slug}`;
  return (
    <figure className="overflow-x-auto border border-line bg-ground">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcSet={`${base}/dark.svg`} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${base}/light.svg`}
          alt={`The ${example.title} document as Archer draws it`}
          width={width}
          height={height}
          // Scale down to fit, but scroll rather than shrink past legibility.
          style={{ width: "100%", maxWidth: width, minWidth: Math.min(width, 640), height: "auto" }}
          className="mx-auto block"
        />
      </picture>
    </figure>
  );
}

function Source({ example }: { example: Example }) {
  const lines = highlightArch(example.source);
  return (
    <div className="border-x border-b border-line" style={{ background: "var(--code-bg)" }}>
      <div className="flex h-10 items-center border-b border-line pl-4 pr-2">
        <span className="mono text-xs text-ink-3">{example.slug}.arch</span>
        <span className="ml-auto">
          <CopySourceButton source={example.source} />
        </span>
      </div>
      <pre
        className="mono overflow-x-auto p-4 text-[12.5px] leading-relaxed"
        style={{ color: "var(--code-fg)" }}
      >
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
            Each example is a complete <code className={inlineCode}>.arch</code> document next
            to the diagram Archer draws from it. Nothing is drawn by hand: the images come from
            the same renderer as share links and README embeds, straight from the code shown.{" "}
            <strong className="text-ink">Open in editor</strong> copies an example into your
            workspace as a real document to edit and keep.
          </p>
          <p className="pb-3 text-[14px] leading-relaxed text-ink-2">
            The first five have no <code className={inlineCode}>layout</code> block. That is how
            agents write Archer, and those diagrams are the app&apos;s auto-layout. The last one
            shows what the canvas writes once you arrange things yourself.
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
            <div className="ml-auto shrink-0">
              <OpenExampleLink slug={e.slug} />
            </div>
          </div>
          <Diagram example={e} />
          <Source example={e} />
        </section>
      ))}
    </SiteFrame>
  );
}
