/**
 * UI icons: Phosphor bold, the set the app's `Icon` uses (components/ui.tsx),
 * inlined as SVG text by the bundler.
 */
import arrowRight from "@phosphor-icons/core/assets/bold/arrow-right-bold.svg";
import check from "@phosphor-icons/core/assets/bold/check-bold.svg";
import checkCircle from "@phosphor-icons/core/assets/bold/check-circle-bold.svg";
import code from "@phosphor-icons/core/assets/bold/code-bold.svg";
import copy from "@phosphor-icons/core/assets/bold/copy-bold.svg";
import fileCode from "@phosphor-icons/core/assets/bold/file-code-bold.svg";
import gitBranch from "@phosphor-icons/core/assets/bold/git-branch-bold.svg";
import gitPullRequest from "@phosphor-icons/core/assets/bold/git-pull-request-bold.svg";
import link from "@phosphor-icons/core/assets/bold/link-simple-bold.svg";
import network from "@phosphor-icons/core/assets/bold/network-bold.svg";
import plug from "@phosphor-icons/core/assets/bold/plug-bold.svg";
import robot from "@phosphor-icons/core/assets/bold/robot-bold.svg";
import sparkle from "@phosphor-icons/core/assets/bold/sparkle-bold.svg";
import warningCircle from "@phosphor-icons/core/assets/bold/warning-circle-bold.svg";
import caretRight from "@phosphor-icons/core/assets/bold/caret-right-bold.svg";
import { svgFrom } from "./dom";

const ICONS = {
  arrowRight,
  caretRight,
  check,
  checkCircle,
  code,
  copy,
  fileCode,
  gitBranch,
  gitPullRequest,
  link,
  network,
  plug,
  robot,
  sparkle,
  warningCircle,
};

export type IconName = keyof typeof ICONS;

/** A Phosphor icon drawn in currentColor. */
export function icon(name: IconName, size?: number): SVGSVGElement {
  const el = svgFrom(ICONS[name]);
  el.setAttribute("fill", "currentColor");
  if (size !== undefined) {
    el.setAttribute("width", String(size));
    el.setAttribute("height", String(size));
  }
  return el;
}
