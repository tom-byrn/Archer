"use client";

import { useState } from "react";
import { SITE_URL } from "@/lib/site";
import { Button, Icon, SwapIcon } from "../ui";

/** What "Copy prompt" puts on the clipboard: the whole setup, step by step. */
const PROMPT = `Set me up with Archer (${SITE_URL}), an architecture canvas I share with AI agents. Work through these steps in order, and stop where a step says to wait for me.

1. Install the Archer MCP server
It's hosted at ${SITE_URL}/mcp (Streamable HTTP). There's no API key, header or client ID to configure: sign-in happens in the browser.
- Claude Code: claude mcp add --transport http archer ${SITE_URL}/mcp
- Codex: codex mcp add archer --url ${SITE_URL}/mcp
- Gemini CLI: gemini mcp add --transport http archer ${SITE_URL}/mcp
- Cursor: add "archer": { "url": "${SITE_URL}/mcp" } under mcpServers in ~/.cursor/mcp.json
- VS Code: add "archer": { "type": "http", "url": "${SITE_URL}/mcp" } under servers in .vscode/mcp.json
- Any other client: follow ${SITE_URL}/docs/mcp
If you can't change your own MCP settings (Claude on the web or desktop, for example), give me the exact steps from that page instead. If your client has to restart or reload to pick up the server, tell me and wait.

2. Connect it
Start the sign-in so my browser opens, or tell me how to (Claude Code: I run /mcp, choose archer, then Authenticate; Codex: codex mcp login archer; Gemini CLI: /mcp auth archer). Wait while I sign in with GitHub, then call get_workspace_info to check you're connected and tell me which workspace you're working in.

3. Learn Archer
Archer keeps a system's architecture as a document we both edit: its components, what runs inside them and how they connect, written in the .arch language and drawn as a live diagram on my canvas. You work on it through the MCP tools. Everything you save is validated (a broken document is rejected, not saved), recorded in the project's history under your name, and appears on my canvas straight away. Call get_guide now, once: it has the workflows, the error codes and the full language spec.

4. Ask me what we're building
If you're working in a codebase right now, ask whether I'd like you to map its architecture into a new Archer project. If not, ask whether I'd like to plan the architecture of a new project together. Wait for my answer before you create anything.`;

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

/** The prompt's opening words, typed out on the hero's line. */
const OPENING = "Set me up with Archer…";

/**
 * The hero's prompt: one quiet line under the buttons, the prompt's opening
 * words typed out like a terminal, and a copy action. Only the action is a
 * button; the whole prompt goes on the clipboard.
 */
export function AgentPromptLine() {
  const { copied, copy } = useCopyPrompt();
  return (
    <div className="mono inline-flex items-center gap-2.5 px-2 py-1 text-sm text-ink-3">
      <span aria-hidden className="text-accent">
        ❯
      </span>
      <span className="landing-typed" style={{ "--chars": OPENING.length } as React.CSSProperties}>
        <span className="landing-typed-text">{OPENING}</span>
        <span aria-hidden className="landing-typed-caret" />
      </span>
      <button
        type="button"
        onClick={copy}
        className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-ink-2 underline decoration-line-2 underline-offset-[3px] transition-colors duration-100 hover:text-ink hover:decoration-current"
      >
        <SwapIcon
          swapped={copied}
          from={<Icon.Copy className="size-3.5" />}
          to={<Icon.Check className="size-3.5" />}
        />
        copy prompt
      </button>
      <CopiedStatus copied={copied} />
    </div>
  );
}
