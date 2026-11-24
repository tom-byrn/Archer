/**
 * UI icons: Phosphor, bold, under the same names as the web's `Icon` set
 * (`apps/web/components/ui.tsx`). Add a name here rather than importing
 * Phosphor elsewhere; each comes from its own module so the bundle holds only
 * these. `GitHubMark` stays GitHub's own mark, as on the web.
 */

import Svg, { Path } from "react-native-svg";
import type { Icon as PhosphorIcon, IconWeight } from "phosphor-react-native";
import { ArrowCounterClockwiseIcon } from "phosphor-react-native/src/icons/ArrowCounterClockwise";
import { ArrowDownIcon } from "phosphor-react-native/src/icons/ArrowDown";
import { ArrowLeftIcon } from "phosphor-react-native/src/icons/ArrowLeft";
import { ArrowRightIcon } from "phosphor-react-native/src/icons/ArrowRight";
import { ArrowSquareInIcon } from "phosphor-react-native/src/icons/ArrowSquareIn";
import { ArrowSquareOutIcon } from "phosphor-react-native/src/icons/ArrowSquareOut";
import { ArrowsLeftRightIcon } from "phosphor-react-native/src/icons/ArrowsLeftRight";
import { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";
import { CaretLeftIcon } from "phosphor-react-native/src/icons/CaretLeft";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { ChatCircleTextIcon } from "phosphor-react-native/src/icons/ChatCircleText";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { CheckCircleIcon } from "phosphor-react-native/src/icons/CheckCircle";
import { CircleHalfIcon } from "phosphor-react-native/src/icons/CircleHalf";
import { ClipboardTextIcon } from "phosphor-react-native/src/icons/ClipboardText";
import { ClockCounterClockwiseIcon } from "phosphor-react-native/src/icons/ClockCounterClockwise";
import { CodeIcon } from "phosphor-react-native/src/icons/Code";
import { CopyIcon } from "phosphor-react-native/src/icons/Copy";
import { CopySimpleIcon } from "phosphor-react-native/src/icons/CopySimple";
import { DotsThreeIcon } from "phosphor-react-native/src/icons/DotsThree";
import { DownloadSimpleIcon } from "phosphor-react-native/src/icons/DownloadSimple";
import { ExportIcon } from "phosphor-react-native/src/icons/Export";
import { FrameCornersIcon } from "phosphor-react-native/src/icons/FrameCorners";
import { LinkSimpleIcon } from "phosphor-react-native/src/icons/LinkSimple";
import { MagnifyingGlassIcon } from "phosphor-react-native/src/icons/MagnifyingGlass";
import { MinusIcon } from "phosphor-react-native/src/icons/Minus";
import { MonitorIcon } from "phosphor-react-native/src/icons/Monitor";
import { MoonIcon } from "phosphor-react-native/src/icons/Moon";
import { NetworkIcon } from "phosphor-react-native/src/icons/Network";
import { PaperPlaneTiltIcon } from "phosphor-react-native/src/icons/PaperPlaneTilt";
import { PencilSimpleIcon } from "phosphor-react-native/src/icons/PencilSimple";
import { PlugIcon } from "phosphor-react-native/src/icons/Plug";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";
import { RectangleDashedIcon } from "phosphor-react-native/src/icons/RectangleDashed";
import { RobotIcon } from "phosphor-react-native/src/icons/Robot";
import { SparkleIcon } from "phosphor-react-native/src/icons/Sparkle";
import { StackSimpleIcon } from "phosphor-react-native/src/icons/StackSimple";
import { SunIcon } from "phosphor-react-native/src/icons/Sun";
import { TrashSimpleIcon } from "phosphor-react-native/src/icons/TrashSimple";
import { UserIcon } from "phosphor-react-native/src/icons/User";
import { UsersIcon } from "phosphor-react-native/src/icons/Users";
import { WarningIcon } from "phosphor-react-native/src/icons/Warning";
import { WarningCircleIcon } from "phosphor-react-native/src/icons/WarningCircle";
import { XIcon } from "phosphor-react-native/src/icons/X";

const ICONS = {
  close: XIcon,
  "chevron-left": CaretLeftIcon,
  "chevron-right": CaretRightIcon,
  "chevron-down": CaretDownIcon,
  "arrow-right": ArrowRightIcon,
  "arrow-left": ArrowLeftIcon,
  "arrow-down": ArrowDownIcon,
  swap: ArrowsLeftRightIcon,
  minus: MinusIcon,
  plus: PlusIcon,
  code: CodeIcon,
  history: ClockCounterClockwiseIcon,
  more: DotsThreeIcon,
  check: CheckIcon,
  copy: CopyIcon,
  duplicate: CopySimpleIcon,
  sparkle: SparkleIcon,
  download: DownloadSimpleIcon,
  link: LinkSimpleIcon,
  external: ArrowSquareOutIcon,
  pencil: PencilSimpleIcon,
  trash: TrashSimpleIcon,
  user: UserIcon,
  users: UsersIcon,
  bot: RobotIcon,
  plug: PlugIcon,
  sun: SunIcon,
  moon: MoonIcon,
  monitor: MonitorIcon,
  contrast: CircleHalfIcon,
  fit: FrameCornersIcon,
  restore: ArrowCounterClockwiseIcon,
  open: ArrowSquareInIcon,
  nested: StackSimpleIcon,
  plane: RectangleDashedIcon,
  send: PaperPlaneTiltIcon,
  feedback: ChatCircleTextIcon,
  "check-circle": CheckCircleIcon,
  warning: WarningIcon,
  alert: WarningCircleIcon,
  diagram: NetworkIcon,
  share: ExportIcon,
  paste: ClipboardTextIcon,
  search: MagnifyingGlassIcon,
} satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof ICONS;

/** Fill weight reads better than bold's hatching for the half-filled contrast circle, as on the web. */
const WEIGHT: Partial<Record<IconName, IconWeight>> = { contrast: "fill" };

export function Icon({ name, size = 16, color }: { name: IconName; size?: number; color: string }) {
  const C = ICONS[name];
  return <C size={size} color={color} weight={WEIGHT[name] ?? "bold"} />;
}

/** GitHub's own mark (the web's `GitHubMark`), not a Phosphor drawing of it. */
export function GitHubMark({ size = 14, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path
        fill={color}
        d="M8 .2a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.08-2.7-1.08-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.88.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 .2Z"
      />
    </Svg>
  );
}
