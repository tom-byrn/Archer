/** The landing page's words, shared with the link preview (page metadata and OG image). */
export const HEADLINE = "Software architecture for your agents.";
export const LEDE =
  "Drag and drop your system architecture onto a canvas, or let your agent write Archer code to do it for you.";
/** The link preview image's line under the headline. */
export const PREVIEW_LEDE = "Ship code faster than you can read it, let your agents map it out.";

/**
 * What the landing's "copy prompt" puts on the clipboard (and the mobile
 * app's welcome screen): the whole setup, step by step, for the Archer at
 * `site`.
 */
export const agentPrompt = (site: string): string => `Set me up with Archer (${site}), an architecture canvas I share with AI agents. Work through these steps in order, and stop where a step says to wait for me.

1. Install the Archer MCP server
It's hosted at ${site}/mcp (Streamable HTTP). There's no API key, header or client ID to configure: sign-in happens in the browser.
- Claude Code: claude mcp add --transport http archer ${site}/mcp
- Codex: codex mcp add archer --url ${site}/mcp
- Gemini CLI: gemini mcp add --transport http archer ${site}/mcp
- Cursor: add "archer": { "url": "${site}/mcp" } under mcpServers in ~/.cursor/mcp.json
- VS Code: add "archer": { "type": "http", "url": "${site}/mcp" } under servers in .vscode/mcp.json
- Any other client: follow ${site}/docs/mcp
If you can't change your own MCP settings (Claude on the web or desktop, for example), give me the exact steps from that page instead. If your client has to restart or reload to pick up the server, tell me and wait.

2. Connect it
Start the sign-in so my browser opens, or tell me how to (Claude Code: I run /mcp, choose archer, then Authenticate; Codex: codex mcp login archer; Gemini CLI: /mcp auth archer). Wait while I sign in with GitHub, then call get_workspace_info to check you're connected and tell me which workspace you're working in.

3. Learn Archer
Archer keeps a system's architecture as a document we both edit: its components, what runs inside them and how they connect, written in the .arch language and drawn as a live diagram on my canvas. You work on it through the MCP tools. Everything you save is validated (a broken document is rejected, not saved), recorded in the project's history under your name, and appears on my canvas straight away. Call get_guide now, once: it has the workflows, the error codes and the full language spec.

4. Ask me what we're building
If you're working in a codebase right now, ask whether I'd like you to map its architecture into a new Archer project. If not, ask whether I'd like to plan the architecture of a new project together. Wait for my answer before you create anything.`;
