"use client";

import { useState } from "react";
import { agentPrompt } from "@/lib/landingCopy";
import { SITE_URL } from "@/lib/site";
import { Button, Icon, SwapIcon } from "../ui";

/** What "Copy prompt" puts on the clipboard: the whole setup, step by step. */
const PROMPT = agentPrompt(SITE_URL);

/** Copies the prompt; `copied` stays true for a moment afterwards. */
function useCopyPrompt() {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard.writeText(PROMPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  return { copied, copy };
}

/** Tells screen readers the prompt was copied: the button's label stays the same. */
function CopiedStatus({ copied }: { copied: boolean }) {
  return (
    <span role="status" className="sr-only">
      {copied ? "Copied" : ""}
    </span>
  );
}

/** The prompt's copy action on its own, for the page's closing call to action. */
export function CopyPromptButton() {
  const { copied, copy } = useCopyPrompt();
  return (
    <>
      <Button
        size="lg"
        icon={<SwapIcon swapped={copied} from={<Icon.Copy />} to={<Icon.Check />} />}
        onClick={copy}
      >
        Copy agent prompt
      </Button>
      <CopiedStatus copied={copied} />
    </>
  );
}

/** The hero line's words: the prompt's opening, then its copy action. */
const OPENING = "Set me up with Archer…";
const ACTION = "copy prompt";
/** How many character cells the line types: the action sits 2 after the
 * opening, and its icon takes 2 (landing.css lays the line out to match). */
const CELLS = OPENING.length + 2 + 2 + ACTION.length;

/**
 * The hero's prompt: one quiet line under the buttons that types out like a
 * terminal, the prompt's opening words and then the copy action, and leaves
 * its cursor blinking after them. Only the action is a button; the whole
 * prompt goes on the clipboard.
 */
export function AgentPromptLine() {
  const { copied, copy } = useCopyPrompt();
  return (
    <div className="mono inline-flex items-center gap-2.5 px-2 py-1 text-sm text-ink-3">
      <span aria-hidden className="text-accent">
        ❯
      </span>
      <span className="landing-typed" style={{ "--cells": CELLS } as React.CSSProperties}>
        <span className="landing-typed-line">
          <span>{OPENING}</span>
          <button
            type="button"
            onClick={copy}
            className="landing-typed-action cursor-pointer rounded-sm text-ink-2 underline decoration-line-2 underline-offset-[3px] transition-colors duration-100 hover:text-ink hover:decoration-current"
          >
            <span className="landing-typed-icon">
              <SwapIcon
                swapped={copied}
                from={<Icon.Copy className="size-3.5" />}
                to={<Icon.Check className="size-3.5" />}
              />
            </span>
            {ACTION}
          </button>
        </span>
        <span aria-hidden className="landing-typed-caret" />
      </span>
      <CopiedStatus copied={copied} />
    </div>
  );
}
