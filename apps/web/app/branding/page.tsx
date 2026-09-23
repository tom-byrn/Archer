import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { Metadata } from "next";
import { GLYPHS, GLYPH_VIEWBOX } from "@archer/catalog";
import { ControlSpecimens, CopyValue, UiIconGrid } from "@/components/brand/BrandSpecimens";
import { SiteFrame } from "@/components/landing/SiteFrame";
import {
  colorUtility,
  groupedColors,
  parseBrandTokens,
  radii,
  textSizes,
  BRAND_CODE_SAMPLE,
  type BrandTokens,
} from "@/lib/brand";
import { newsreader } from "@/lib/fonts";
import { highlightArch } from "@/lib/highlightArch";
import { HEADLINE, LEDE } from "@/lib/landingCopy";
import { LANDING_SAMPLE } from "@/lib/landingSample";
import { renderArchSvg } from "@/lib/svg";

/**
 * Brand kit: the mark, colors, type and primitives on one page. Signed-in
 * only (like every route not listed public in middleware.ts) and deliberately
 * linked from nowhere. Token values are read from app/globals.css at build
 * time, so the page matches the app.
 */
export const metadata: Metadata = { title: "Brand · Archer" };

// Prerendered at build time, from the source tree (like the OG image's fonts).
export const dynamic = "force-static";

type Theme = "light" | "dark";
const THEMES: Theme[] = ["light", "dark"];

const cls = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(" ");

const SECTIONS = [
  { id: "logo", label: "Logo" },
  { id: "color", label: "Color" },
  { id: "type", label: "Type" },
  { id: "shape", label: "Shape" },
  { id: "icons", label: "Icons" },
  { id: "components", label: "Components" },
  { id: "voice", label: "Voice" },
] as const;

const readTokens = async (): Promise<BrandTokens> =>
  parseBrandTokens(await readFile(join(process.cwd(), "app/globals.css"), "utf8"));

/** Inline custom properties that theme a subtree, whatever the OS scheme. */
const themeVars = (tokens: BrandTokens, theme: Theme): CSSProperties =>
  ({
    ...Object.fromEntries(Object.entries(tokens[theme]).map(([k, v]) => [`--${k}`, v])),
    colorScheme: theme,
  }) as CSSProperties;

/** A color swatch as it looks on its theme's page background (so tints read true). */
const onBackground = (value: string, bg: string): string =>
  `linear-gradient(${value}, ${value}), ${bg}`;

/** The landing page's backdrop in one theme, as its CSS fallback draws it (landing.css). */
const landingFade = (tokens: BrandTokens, theme: Theme): string =>
  `linear-gradient(180deg, ${tokens[theme]["landing-fade"]}, ${tokens[theme]["landing-bg"]} 85%)`;

export default async function BrandingPage() {
  const tokens = await readTokens();
  return (
    <SiteFrame className={newsreader.variable}>
      <nav className="landing-joints flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-5 py-5 sm:px-10">
        <span className="mono text-sm text-ink-3">Brand</span>
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="mono rounded-sm text-sm text-ink-2 transition-colors duration-100 hover:text-ink"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <header className="landing-joints border-b border-line px-5 pb-12 pt-14 sm:px-10 sm:pb-16 sm:pt-20">
        <h1 className="landing-headline text-display-sm text-ink">Brand kit</h1>
        <p className="max-w-[58ch] pt-5 text-lede text-ink-2">
          The mark, colors, type and parts Archer is made of. Colors and scales are read from the
          app&rsquo;s stylesheet when the site builds, so this page always matches what ships. Click
          any value to copy it.
        </p>
      </header>

      <LogoSection tokens={tokens} />
      <ColorSection tokens={tokens} />
      <TypeSection tokens={tokens} />
      <ShapeSection tokens={tokens} />
      <IconSection />
      <ComponentSection tokens={tokens} />
      <VoiceSection />
    </SiteFrame>
  );
}

/* ---------------------------------------------------------------- Layout */

function Section({
  id,
  title,
  lede,
  last,
  children,
}: {
  id: (typeof SECTIONS)[number]["id"];
  title: string;
  lede?: ReactNode;
  last?: boolean;
  children: ReactNode;
}) {
  const index = SECTIONS.findIndex((s) => s.id === id) + 1;
  return (
    <section
      id={id}
      className={cls(
        "scroll-mt-4 px-5 py-12 sm:px-10 sm:py-16",
        !last && "landing-joints border-b border-line",
      )}
    >
      <div className="flex items-baseline gap-3">
        <span className="mono text-sm text-ink-3">{String(index).padStart(2, "0")}</span>
        <h2 className="text-xl font-semibold text-ink">{title}</h2>
      </div>
      {lede && <p className="max-w-[64ch] pt-2 text-lg text-ink-2">{lede}</p>}
      <div className="flex flex-col gap-12 pt-10">{children}</div>
    </section>
  );
}

function Block({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <h3 className="eyebrow">{title}</h3>
      {note && <p className="max-w-[72ch] pt-1 text-sm text-ink-2">{note}</p>}
      <div className="pt-4">{children}</div>
    </div>
  );
}

/** A box painted with one theme's tokens, so both themes can sit side by side. */
function Panel({
  tokens,
  theme,
  label = true,
  className,
  style,
  children,
}: {
  tokens: BrandTokens;
  theme: Theme;
  label?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      style={{ ...themeVars(tokens, theme), ...style }}
      className={cls("relative border border-line bg-bg text-ink", className)}
    >
      {label && (
        <span className="mono pointer-events-none absolute right-3 top-2.5 text-xs text-ink-3">
          {theme}
        </span>
      )}
      {children}
    </div>
  );
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="mono rounded-xs bg-surface-2 px-1 py-0.5 text-[12.5px] text-ink">{children}</code>
);

/* ------------------------------------------------------------------ Logo */

const ICON_SIZES = [96, 64, 32, 16];

const DOWNLOADS = [
  { href: "/icon.svg", label: "icon.svg", note: "Vector app icon" },
  { href: "/apple-icon.png", label: "apple-icon.png", note: "180 × 180" },
  { href: "/favicon.ico", label: "favicon.ico", note: "Browser tab" },
];

function LogoSection({ tokens }: { tokens: BrandTokens }) {
  return (
    <Section
      id="logo"
      title="Logo"
      lede="The wordmark is set as text in Playfair Display, in the current ink color. The app icon is a serif capital A."
    >
      <Block
        title="Wordmark"
        note={
          <>
            Playfair Display Bold, tracking −0.01em: <Code>font-display</Code>.
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {THEMES.map((theme) => (
            <Panel key={theme} tokens={tokens} theme={theme} className="grid h-48 place-items-center">
              <span className="font-display text-[64px] leading-none">Archer</span>
            </Panel>
          ))}
        </div>
      </Block>

      <Block
        title="Footer wordmark"
        note="The landing page signs off with the wordmark in Playfair Display Black, tracking −0.04em, at 11% ink, cropped by the page edge."
      >
        <div className="grid gap-4">
          {THEMES.map((theme) => (
            <Panel
              key={theme}
              tokens={tokens}
              theme={theme}
              className="overflow-hidden px-6 pt-6"
              style={{ "--bg": tokens[theme]["landing-bg"] } as CSSProperties}
            >
              <div className="landing-wordmark" style={{ fontSize: "clamp(64px, 17vw, 200px)" }} aria-hidden>
                Archer
              </div>
            </Panel>
          ))}
        </div>
      </Block>

      <Block title="App icon" note="A light capital A on a near-black rounded square, at every size.">
        <div className="grid gap-4 sm:grid-cols-2">
          {THEMES.map((theme) => (
            <Panel key={theme} tokens={tokens} theme={theme} className="flex h-48 items-center justify-center gap-6 px-6">
              {ICON_SIZES.map((size) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={size} src="/icon.svg" alt="" width={size} height={size} />
              ))}
            </Panel>
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 pt-4">
          {DOWNLOADS.map((d) => (
            <li key={d.href} className="flex items-baseline gap-2 text-sm">
              <a
                href={d.href}
                download
                className="mono rounded-sm text-ink underline decoration-line-2 underline-offset-4 hover:decoration-ink-3"
              >
                {d.label}
              </a>
              <span className="text-ink-3">{d.note}</span>
            </li>
          ))}
        </ul>
      </Block>
    </Section>
  );
}

/* ----------------------------------------------------------------- Color */

const CORE = [
  { token: "accent", name: "Accent" },
  { token: "ink", name: "Ink" },
  { token: "bg", name: "Background" },
  { token: "surface", name: "Surface" },
];

/** Light half on the left, dark half on the right. */
function SplitSwatch({
  tokens,
  light,
  dark,
  className,
}: {
  tokens: BrandTokens;
  light: string;
  dark: string;
  className?: string;
}) {
  return (
    <div className={cls("grid grid-cols-2 border-b border-line", className)}>
      <div style={{ background: onBackground(light, tokens.light.bg!) }} />
      <div style={{ background: onBackground(dark, tokens.dark.bg!) }} />
    </div>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="min-w-0">
        <CopyValue value={value} />
      </dd>
    </>
  );
}

function ColorSection({ tokens }: { tokens: BrandTokens }) {
  const groups = groupedColors(tokens);
  return (
    <Section
      id="color"
      title="Color"
      lede="One warm-neutral gray ramp and one green accent, in a light and a dark theme that follow the system setting. Each swatch shows the light theme on the left and the dark theme on the right."
    >
      <Block title="Core">
        <ul className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {CORE.map(({ token, name }) => (
            <li key={token} className="flex flex-col border border-line bg-surface">
              <SplitSwatch tokens={tokens} light={tokens.light[token]!} dark={tokens.dark[token]!} className="h-28" />
              <div className="p-3">
                <div className="text-base font-semibold text-ink">{name}</div>
                <dl className="grid grid-cols-[36px_minmax(0,1fr)] items-baseline gap-x-2 pt-1">
                  <ValueRow label="Light" value={tokens.light[token]!} />
                  <ValueRow label="Dark" value={tokens.dark[token]!} />
                </dl>
              </div>
            </li>
          ))}
          <li className="col-span-2 flex flex-col border border-line bg-surface lg:col-span-1">
            <div className="grid h-28 grid-cols-2 border-b border-line">
              {THEMES.map((theme) => (
                <div key={theme} style={{ background: landingFade(tokens, theme) }} />
              ))}
            </div>
            <div className="p-3">
              <div className="text-base font-semibold text-ink">Landing</div>
              {/* Both themes' values are under Landing, below. */}
              <dl className="grid grid-cols-[36px_minmax(0,1fr)] items-baseline gap-x-2 pt-1">
                <ValueRow label="Base" value="--landing-bg" />
                <ValueRow label="Fade" value="--landing-fade" />
              </dl>
            </div>
          </li>
        </ul>
      </Block>

      {groups.map((group) => (
        <Block key={group.title} title={group.title} note={group.note}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {group.tokens.map(({ token, role }) => {
              const utility = group.prefix && colorUtility(tokens.theme, token);
              return (
                <li key={token} className="flex flex-col border border-line bg-surface">
                  <SplitSwatch
                    tokens={tokens}
                    light={tokens.light[token]!}
                    dark={tokens.dark[token]!}
                    className="h-14"
                  />
                  <div className="flex flex-1 flex-col p-3">
                    <CopyValue value={`--${token}`} className="!text-sm !text-ink" />
                    {role && <p className="pt-0.5 text-sm text-ink-2">{role}</p>}
                    <dl className="mt-auto grid grid-cols-[36px_minmax(0,1fr)] items-baseline gap-x-2 pt-2">
                      <ValueRow label="Light" value={tokens.light[token]!} />
                      <ValueRow label="Dark" value={tokens.dark[token]!} />
                      {utility && <ValueRow label="Class" value={`${group.prefix}-${utility}`} />}
                    </dl>
                  </div>
                </li>
              );
            })}
          </ul>
        </Block>
      ))}
    </Section>
  );
}

/* ------------------------------------------------------------------ Type */

const NEWSREADER_STACK = 'var(--font-newsreader), Georgia, "Times New Roman", serif';

/** Text sizes used only on the landing page (see globals.css). */
const LANDING_SIZES = new Set(["lede", "display-sm", "display"]);

function TypeSection({ tokens }: { tokens: BrandTokens }) {
  const { theme } = tokens;
  const families = [
    {
      name: "Playfair Display",
      role: "The wordmark and document titles.",
      weights: "Bold 700 · Black 900",
      className: "font-display",
      use: "font-display",
      stack: theme["font-display"]!,
      sample: "Archer",
      sampleClass: "text-[40px] leading-tight",
    },
    {
      name: "Newsreader",
      role: "The landing page headline, at optical size 72.",
      weights: "Medium 500",
      className: "landing-headline",
      use: "landing-headline",
      stack: NEWSREADER_STACK,
      sample: HEADLINE,
      sampleClass: "text-[32px] leading-[1.05]",
    },
    {
      name: "Inter",
      role: "Everything else: the interface, body copy and docs.",
      weights: "Regular 400 · Medium 500 · Semibold 600 · Bold 700",
      className: "font-sans",
      use: "font-sans",
      stack: theme["font-sans"]!,
      sample: LEDE,
      sampleClass: "text-lg",
    },
    {
      name: "System monospace",
      role: "Code, file names, component types and nav labels.",
      weights: "Regular 400",
      className: "mono",
      use: "mono",
      stack: theme["font-mono"]!,
      sample: "api -> db @sql : \"reads\"",
      sampleClass: "text-lg",
    },
  ];
  return (
    <Section
      id="type"
      title="Typography"
      lede="Two serifs for display and one sans for everything you read in the product, with the system monospace for code."
    >
      <Block title="Families">
        <ul className="grid gap-4 sm:grid-cols-2">
          {families.map((f) => (
            <li key={f.name} className="flex flex-col border border-line bg-surface p-5">
              <div className={cls(f.className, "text-[56px] leading-none text-ink")}>Aa</div>
              <div className="pt-5 text-lg font-semibold text-ink">{f.name}</div>
              <p className="text-sm text-ink-2">{f.role}</p>
              <p className="text-sm text-ink-3">{f.weights}</p>
              <p className={cls(f.className, f.sampleClass, "pb-5 pt-4 text-ink")}>{f.sample}</p>
              <dl className="mt-auto grid grid-cols-[40px_minmax(0,1fr)] items-baseline gap-x-2 border-t border-line pt-3">
                <ValueRow label="Class" value={f.use} />
                <ValueRow label="Stack" value={f.stack} />
              </dl>
            </li>
          ))}
        </ul>
      </Block>

      <Block
        title="Scale"
        note={
          <>
            Each size carries its own line height. The interface runs on <Code>text-sm</Code> and{" "}
            <Code>text-base</Code>; lede and display are for the landing page only.
          </>
        }
      >
        <ul className="border-t border-line">
          {textSizes(theme).map(({ name, size, lineHeight }) => (
            <li
              key={name}
              className="grid grid-cols-2 items-baseline gap-x-4 gap-y-1 border-b border-line py-3 sm:grid-cols-[112px_88px_minmax(0,1fr)]"
            >
              <CopyValue value={`text-${name}`} />
              <span className="mono text-right text-xs text-ink-3 sm:text-left">
                {size} / {lineHeight}
              </span>
              <span
                className={cls(
                  "col-span-2 text-ink sm:col-span-1",
                  LANDING_SIZES.has(name) && name !== "lede" && "landing-headline",
                )}
                style={{ fontSize: size, lineHeight }}
              >
                {LANDING_SIZES.has(name) && name !== "lede" ? HEADLINE : "Drag a box onto the canvas"}
              </span>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Eyebrow" note="Panel and section labels: 11px semibold, uppercase, tracked +0.04em, in ink-3.">
        <div className="flex items-center gap-4 border border-line bg-surface px-4 py-3">
          <span className="eyebrow">Properties</span>
          <CopyValue value="eyebrow" className="ml-auto" />
        </div>
      </Block>
    </Section>
  );
}

/* ----------------------------------------------------------------- Shape */

const RADIUS_USE: Record<string, string> = {
  xs: "Inline code",
  sm: "Chips, keys, glyph tiles",
  md: "Buttons, inputs, nodes",
  lg: "Menus",
  xl: "Dialogs, sheets",
};

function ShapeSection({ tokens }: { tokens: BrandTokens }) {
  return (
    <Section
      id="shape"
      title="Shape and depth"
      lede="Small radii, hairline borders and very little shadow. Structure comes from rules, not boxes."
    >
      <Block title="Radius">
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {radii(tokens.theme).map(({ name, value }) => (
            <li key={name} className="flex flex-col gap-3">
              <div className="h-20 border border-line-2 bg-surface-2" style={{ borderRadius: value }} />
              <div>
                <CopyValue value={`rounded-${name}`} />
                <p className="text-xs text-ink-3">
                  {value} · {RADIUS_USE[name] ?? ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Elevation" note="Two shadows: sm lifts controls off a surface, md floats menus, dialogs and dragged nodes.">
        <div className="grid gap-4 sm:grid-cols-2">
          {THEMES.map((theme) => (
            <Panel key={theme} tokens={tokens} theme={theme} className="grid grid-cols-2 gap-6 p-8 pt-10">
              {(["sm", "md"] as const).map((s) => (
                <div
                  key={s}
                  className="grid h-24 place-items-center rounded-lg border border-line bg-surface"
                  style={{ boxShadow: `var(--shadow-${s})` }}
                >
                  <span className="mono text-xs text-ink-2">shadow-{s}</span>
                </div>
              ))}
            </Panel>
          ))}
        </div>
      </Block>

      <Block
        title="Rules and joints"
        note="Public pages sit in one ruled column. Where a rule meets the column's sides, an 8px diamond marks the joint."
      >
        <div className="border border-line bg-surface px-8 py-6 sm:px-16">
          <div className="border-x border-line">
            <div className="landing-joints h-12 border-b border-line" style={{ "--bg": "var(--surface)" } as CSSProperties} />
            <div className="landing-joints h-12 border-b border-line" style={{ "--bg": "var(--surface)" } as CSSProperties} />
            <div className="h-12" />
          </div>
        </div>
      </Block>
    </Section>
  );
}

/* ----------------------------------------------------------------- Icons */

function IconSection() {
  return (
    <Section
      id="icons"
      title="Iconography"
      lede="Two small sets of Phosphor icons (phosphoricons.com), drawn in the current text color."
    >
      <Block title="Interface" note="Bold weight: a 1.5px stroke at 16px. Kept small on purpose: add to the set only when nothing fits.">
        <UiIconGrid />
      </Block>
      <Block
        title="Component glyphs"
        note="Regular weight: a 1.5px stroke at 24px. On the canvas each glyph takes its component type's color, on a tile of that color at 14%."
      >
        <ul className="grid grid-cols-3 border-l border-t border-line sm:grid-cols-5 lg:grid-cols-8">
          {Object.entries(GLYPHS).map(([name, markup]) => (
            <li
              key={name}
              className="flex flex-col items-center gap-2 border-b border-r border-line px-2 py-4 text-ink"
            >
              <svg
                viewBox={GLYPH_VIEWBOX}
                width={24}
                height={24}
                aria-hidden
                dangerouslySetInnerHTML={{ __html: markup }}
              />
              <span className="mono truncate text-xs text-ink-3">{name}</span>
            </li>
          ))}
        </ul>
      </Block>
    </Section>
  );
}

/* ------------------------------------------------------------ Components */

const svgDataUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

function ComponentSection({ tokens }: { tokens: BrandTokens }) {
  const lines = highlightArch(BRAND_CODE_SAMPLE);
  return (
    <Section
      id="components"
      title="Components"
      lede={
        <>
          The live primitives from <Code>components/ui.tsx</Code>. Every control in the app is built
          from these.
        </>
      }
    >
      <Block title="Controls">
        <div className="grid gap-4 lg:grid-cols-2">
          {THEMES.map((theme) => (
            <Panel key={theme} tokens={tokens} theme={theme} className="p-5 pt-10">
              <ControlSpecimens />
            </Panel>
          ))}
        </div>
      </Block>

      <Block title="Diagram" note="How a document draws: typed boxes with a tinted glyph tile, stepped connectors, chips for protocol and label.">
        <div className="grid gap-4 lg:grid-cols-2">
          {THEMES.map((theme) => (
            <Panel
              key={theme}
              tokens={tokens}
              theme={theme}
              className="p-4 pt-10"
              style={{ background: "var(--ground)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={svgDataUri(renderArchSvg(LANDING_SAMPLE, { theme, showTitle: false, background: false }))}
                alt={`An example diagram, ${theme} theme`}
                className="mx-auto block h-auto w-full"
              />
            </Panel>
          ))}
        </div>
      </Block>

      <Block title="Code" note="Archer source, highlighted with the syntax tokens.">
        <div className="grid gap-4 lg:grid-cols-2">
          {THEMES.map((theme) => (
            <Panel key={theme} tokens={tokens} theme={theme} className="overflow-hidden" style={{ background: "var(--code-bg)" }}>
              <div className="flex h-10 items-center border-b border-line px-4">
                <span className="mono text-xs text-ink-3">billing.arch</span>
              </div>
              <pre className="mono overflow-x-auto p-4 text-[12.5px] leading-relaxed" style={{ color: "var(--code-fg)" }}>
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
            </Panel>
          ))}
        </div>
      </Block>
    </Section>
  );
}

/* ----------------------------------------------------------------- Voice */

const NAMES = [
  { term: "Archer", mono: false, use: "The product and its language. One word, capital A." },
  { term: "Archer code", mono: false, use: "What an agent writes: “let your agent write Archer code”." },
  { term: ".arch", mono: true, use: "An Archer source file, e.g. architecture.arch." },
  { term: "archer", mono: true, use: "The command-line tool: always lowercase, set in mono." },
];

function VoiceSection() {
  return (
    <Section
      id="voice"
      title="Voice"
      lede="Plain and concrete. Say what the product does, in the words a developer would use."
      last
    >
      <Block title="Headline and lede" note="The words the landing page and link previews lead with.">
        <div className="border border-line bg-surface p-6 sm:p-8">
          <p className="landing-headline max-w-[14ch] text-display-sm text-ink">{HEADLINE}</p>
          <p className="max-w-[46ch] pt-5 text-lede text-ink-2">{LEDE}</p>
        </div>
      </Block>
      <Block title="Names">
        <dl className="grid border-t border-line sm:grid-cols-[180px_minmax(0,1fr)]">
          {NAMES.map((n) => (
            <Fragment key={n.term}>
              <dt
                className={cls(
                  "pt-3 text-base font-semibold text-ink sm:border-b sm:border-line sm:py-3",
                  n.mono && "mono",
                )}
              >
                {n.term}
              </dt>
              <dd className="border-b border-line pb-3 text-base text-ink-2 sm:py-3">{n.use}</dd>
            </Fragment>
          ))}
        </dl>
      </Block>
    </Section>
  );
}
