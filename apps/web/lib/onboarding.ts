/**
 * The first-run walkthrough's steps (pure; drawn by components/Tour.tsx,
 * state in convex/onboarding.ts). A step with a `target` rings every element
 * marked `data-tour="<target>"`. A step with `done` waits for the user to do
 * something in the editor; one without it has a Next button.
 */

export interface TourStep {
  id: string;
  title: string;
  body: string;
  target?: string;
  /** Short hint shown under the body while the step waits for the user. */
  hint?: string;
}

export interface DashboardStep extends TourStep {
  /** The step ends when the user clicks its target (no Next button). */
  clickTarget?: boolean;
}

export const DASHBOARD_STEPS: readonly DashboardStep[] = [
  {
    id: "welcome",
    title: "Welcome to Archer",
    body: "Archer is a canvas for software architecture. Every box and arrow you draw compiles to a small text language (.arch) that coding agents read and write, so the diagram and the code stay in step. This quick tour shows you the basics and gets your first project started.",
  },
  {
    id: "agents",
    title: "Bring your agents",
    body: "Connect Claude Code, Cursor or any MCP client here. Agents can then read your diagrams, draw new ones and keep them up to date as the code changes.",
    target: "connect-agent",
  },
  {
    id: "import",
    title: "Start from something",
    body: "Later you can start from a ready-made sample, or import an .arch file from a GitHub repository and keep it in sync.",
    target: "import",
  },
  {
    id: "create",
    title: "Create your first project",
    body: "For now, start from a blank canvas. Click New document and we'll build a small diagram together.",
    target: "new-document",
    clickTarget: true,
  },
];

/** What the editor reports to the tour; counts are for the whole document. */
export interface EditorProgress {
  components: number;
  connections: number;
  /** Components dragged to a new spot since the editor opened. */
  moves: number;
  codeOpen: boolean;
}

export interface EditorStep extends TourStep {
  done?: (p: EditorProgress) => boolean;
}

export const EDITOR_STEPS: readonly EditorStep[] = [
  {
    id: "canvas",
    title: "This is your canvas",
    body: "Components are the boxes: services, databases, queues, people. Connections are the arrows between them. Let's add a couple.",
  },
  {
    id: "add",
    title: "Add a component",
    body: "Open the components sidebar and drag a type onto the canvas, or click + to pick one from the list. You can also right-click the canvas.",
    hint: "Waiting for your first component…",
    target: "add-component",
    done: (p) => p.components >= 1,
  },
  {
    id: "add-second",
    title: "Add one more",
    body: "Nice! The inspector on the right lets you name it and describe what it does. Now add a second component so there's something to connect.",
    hint: "Waiting for a second component…",
    target: "add-component",
    done: (p) => p.components >= 2,
  },
  {
    id: "move",
    title: "Move things around",
    body: "Drag a component to a new spot on the canvas. Drop one onto another to nest it inside, and ⌘Z undoes anything.",
    hint: "Waiting for you to drag a component…",
    done: (p) => p.moves >= 1,
  },
  {
    id: "connect",
    title: "Connect them",
    body: "Hover a component and drag from one of the dots on its edge to the other component. Select the arrow to label it.",
    hint: "Waiting for a connection…",
    done: (p) => p.connections >= 1,
  },
  {
    id: "code",
    title: "See the code",
    body: "Everything on the canvas is plain .arch text. Open the code pane to see it: edit either side and the other follows. This is what agents read.",
    hint: "Open the code pane to continue…",
    target: "code",
    done: (p) => p.codeOpen,
  },
  {
    id: "finish",
    title: "You're all set",
    body: "Changes save automatically. Share a read-only link, export an image, or connect an agent from the dashboard to keep this diagram in sync with your code.",
  },
];

/**
 * The step to show: the first one at or after `from` the user hasn't done
 * yet. Steps that wait for an action are skipped once it's done (connecting
 * before moving doesn't stall the tour); Next-button steps never are.
 */
export function nextEditorStep(from: number, p: EditorProgress): number {
  let i = from;
  while (i < EDITOR_STEPS.length - 1 && EDITOR_STEPS[i]!.done?.(p)) i++;
  return i;
}
