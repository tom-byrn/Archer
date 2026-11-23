import { describe, expect, it } from "vitest";
import { DASHBOARD_STEPS, EDITOR_STEPS, nextEditorStep, type EditorProgress } from "@/lib/onboarding";

const none: EditorProgress = { components: 0, connections: 0, moves: 0, codeOpen: false };
const id = (i: number) => EDITOR_STEPS[i]!.id;

describe("first-run walkthrough", () => {
  it("ends the dashboard part by clicking New document", () => {
    const last = DASHBOARD_STEPS[DASHBOARD_STEPS.length - 1]!;
    expect(last.target).toBe("new-document");
    expect(last.clickTarget).toBe(true);
    expect(DASHBOARD_STEPS.slice(0, -1).every((s) => !s.clickTarget)).toBe(true);
  });

  it("waits on each action in turn", () => {
    expect(id(nextEditorStep(0, none))).toBe("canvas");
    expect(id(nextEditorStep(1, none))).toBe("add");
    expect(id(nextEditorStep(1, { ...none, components: 1 }))).toBe("add-second");
    expect(id(nextEditorStep(1, { ...none, components: 2 }))).toBe("move");
    expect(id(nextEditorStep(1, { ...none, components: 2, moves: 1 }))).toBe("connect");
    expect(id(nextEditorStep(1, { ...none, components: 2, moves: 1, connections: 1 }))).toBe("code");
  });

  it("skips actions already done, but never a step with a Next button", () => {
    const all: EditorProgress = { components: 3, connections: 2, moves: 4, codeOpen: true };
    expect(id(nextEditorStep(0, all))).toBe("canvas");
    expect(id(nextEditorStep(1, all))).toBe("finish");
  });

  it("finishes on a step the user confirms", () => {
    const last = EDITOR_STEPS[EDITOR_STEPS.length - 1]!;
    expect(last.done).toBeUndefined();
  });
});
