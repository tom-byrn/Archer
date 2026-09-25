"use client";

/**
 * The interactive parts of the brand page (`/branding`): copyable values and
 * live specimens of the UI primitives. The page itself is a server component.
 */

import { useState, type ReactNode } from "react";
import { Loading } from "loading-dev";
import {
  Button,
  Chip,
  GitHubMark,
  Icon,
  IconButton,
  Input,
  Kbd,
  Segmented,
  SwapIcon,
  cx,
} from "../ui";

/** A value (hex, class name, stack) that copies itself on click. */
export function CopyValue({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${value}`}
      onClick={() =>
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        })
      }
      className={cx(
        "mono inline-flex max-w-full items-center gap-1 rounded-xs text-left text-xs text-ink-2 transition-colors duration-100 hover:text-ink",
        className,
      )}
    >
      <span className="truncate">{value}</span>
      {copied && <Icon.Check className="h-3 w-3 shrink-0 text-accent" />}
    </button>
  );
}

/** The app's UI icon set (components/ui.tsx), by name. */
export function UiIconGrid() {
  const icons = [
    ...Object.entries(Icon).map(([name, Glyph]) => ({ name, node: <Glyph className="h-4 w-4" /> })),
    { name: "GitHubMark", node: <GitHubMark className="h-4 w-4" /> },
  ];
  return (
    <ul className="grid grid-cols-3 border-l border-t border-line sm:grid-cols-5 lg:grid-cols-8">
      {icons.map(({ name, node }) => (
        <li
          key={name}
          className="flex flex-col items-center gap-2 border-b border-r border-line px-2 py-4 text-ink"
        >
          {node}
          <span className="mono truncate text-xs text-ink-3">{name}</span>
        </li>
      ))}
    </ul>
  );
}

/** The primitives every screen is built from, in their states. */
export function ControlSpecimens() {
  const [view, setView] = useState<"canvas" | "code">("canvas");
  return (
    <div className="flex flex-col gap-5">
      <Row label="Button">
        <Button variant="primary">Primary</Button>
        <Button>Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button icon={<Icon.Plus />}>With icon</Button>
        <Button disabled>Disabled</Button>
      </Row>
      <Row label="Small">
        <Button variant="primary" size="sm">
          Primary
        </Button>
        <Button size="sm">Secondary</Button>
        <Button variant="ghost" size="sm" icon={<Icon.Copy />}>
          Copy
        </Button>
      </Row>
      <Row label="SwapIcon">
        <SwapSpecimen />
      </Row>
      <Row label="IconButton">
        <IconButton label="Undo">
          <Icon.Undo />
        </IconButton>
        <IconButton label="Redo">
          <Icon.Redo />
        </IconButton>
        <IconButton label="Code" active>
          <Icon.Code />
        </IconButton>
        <IconButton label="More" size="sm">
          <Icon.More />
        </IconButton>
      </Row>
      <Row label="Focus">
        {/* The keyboard focus ring, held on. */}
        <Button style={{ boxShadow: "var(--focus)" }}>Focused</Button>
      </Row>
      <Row label="Chip">
        <Chip>Neutral</Chip>
        <Chip tone="accent">Accent</Chip>
        <Chip tone="warn">Warn</Chip>
        <Chip tone="danger">Danger</Chip>
      </Row>
      <Row label="Kbd">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
        <Kbd>Esc</Kbd>
      </Row>
      <Row label="Input">
        <div className="w-full max-w-56">
          <Input placeholder="Component name" />
        </div>
        <div className="w-full max-w-40">
          <Input mono defaultValue="@aws.lambda" />
        </div>
      </Row>
      <Row label="Segmented">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "canvas", label: "Canvas" },
            { value: "code", label: "Code" },
          ]}
        />
      </Row>
      <Row label="Loading">
        <span role="status" aria-label="Loading" className="text-ink-3">
          <Loading size={28} />
        </span>
      </Row>
    </div>
  );
}

/** A copy button's feedback, without the copying: click to see the icons trade places. */
function SwapSpecimen() {
  const [swapped, setSwapped] = useState(false);
  return (
    <Button
      size="sm"
      icon={<SwapIcon swapped={swapped} from={<Icon.Copy />} to={<Icon.Check />} />}
      onClick={() => {
        setSwapped(true);
        setTimeout(() => setSwapped(false), 1200);
      }}
    >
      Copy
    </Button>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-x-4">
      <span className="mono text-xs text-ink-3">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
