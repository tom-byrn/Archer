"use client";

import { useState } from "react";
import { SITE_URL } from "@/lib/site";
import { Button, Icon } from "../ui";

const PROMPT = `Read ${SITE_URL}/language to learn the Archer language.

Then map this repository's architecture as an Archer document: the components, what runs inside them, and how they connect. Use real names from the code and give each component a one-line desc. Check the result against the spec and save it as architecture.arch.

When you're done, tell me to paste it into a new document at ${SITE_URL}.`;

export function AgentPrompt() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(PROMPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <div className="overflow-hidden border border-line-2 bg-surface shadow-md">
      <div className="flex items-center gap-3 border-b border-line py-2 pl-4 pr-2">
        <span className="text-sm font-medium text-ink">Prompt for your coding agent</span>
        <Button
          variant="primary"
          className="ml-auto min-w-[104px] rounded-none!"
          icon={copied ? <Icon.Check /> : <Icon.Copy />}
          onClick={copy}
        >
          <span aria-live="polite">{copied ? "Copied" : "Copy prompt"}</span>
        </Button>
      </div>
      <p className="mono whitespace-pre-wrap bg-[var(--code-bg)] px-4 py-3.5 text-sm leading-[20px] text-[var(--code-fg)]">
        {PROMPT}
      </p>
    </div>
  );
}
