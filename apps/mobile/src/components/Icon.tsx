/**
 * UI icons: Phosphor, bold, as on the web (`apps/web/components/ui.tsx`
 * `Icon`). Add a name here rather than importing Phosphor elsewhere; each
 * comes from its own module so the bundle holds only these.
 */

import Svg, { Path } from "react-native-svg";
import type { Icon as PhosphorIcon } from "phosphor-react-native";
import { ArrowCounterClockwiseIcon } from "phosphor-react-native/src/icons/ArrowCounterClockwise";
import { ArrowLeftIcon } from "phosphor-react-native/src/icons/ArrowLeft";
import { ArrowRightIcon } from "phosphor-react-native/src/icons/ArrowRight";
import { ArrowsLeftRightIcon } from "phosphor-react-native/src/icons/ArrowsLeftRight";
import { ArrowSquareOutIcon } from "phosphor-react-native/src/icons/ArrowSquareOut";
import { BookOpenIcon } from "phosphor-react-native/src/icons/BookOpen";
import { CaretDownIcon } from "phosphor-react-native/src/icons/CaretDown";
import { CaretRightIcon } from "phosphor-react-native/src/icons/CaretRight";
import { ChatCircleIcon } from "phosphor-react-native/src/icons/ChatCircle";
import { CheckIcon } from "phosphor-react-native/src/icons/Check";
import { ClipboardTextIcon } from "phosphor-react-native/src/icons/ClipboardText";
import { ClockCounterClockwiseIcon } from "phosphor-react-native/src/icons/ClockCounterClockwise";
import { CodeIcon } from "phosphor-react-native/src/icons/Code";
import { CompassIcon } from "phosphor-react-native/src/icons/Compass";
import { CopyIcon } from "phosphor-react-native/src/icons/Copy";
import { CornersOutIcon } from "phosphor-react-native/src/icons/CornersOut";
import { DesktopIcon } from "phosphor-react-native/src/icons/Desktop";
import { DotsThreeIcon } from "phosphor-react-native/src/icons/DotsThree";
import { ExportIcon } from "phosphor-react-native/src/icons/Export";
import { FileTextIcon } from "phosphor-react-native/src/icons/FileText";
import { GitBranchIcon } from "phosphor-react-native/src/icons/GitBranch";
import { GitCommitIcon } from "phosphor-react-native/src/icons/GitCommit";
import { GlobeIcon } from "phosphor-react-native/src/icons/Globe";
import { GraphIcon } from "phosphor-react-native/src/icons/Graph";
import { InfoIcon } from "phosphor-react-native/src/icons/Info";
import { LinkIcon } from "phosphor-react-native/src/icons/Link";
import { LockIcon } from "phosphor-react-native/src/icons/Lock";
import { MagnifyingGlassIcon } from "phosphor-react-native/src/icons/MagnifyingGlass";
import { MinusIcon } from "phosphor-react-native/src/icons/Minus";
import { MoonIcon } from "phosphor-react-native/src/icons/Moon";
import { PencilSimpleIcon } from "phosphor-react-native/src/icons/PencilSimple";
import { PlusIcon } from "phosphor-react-native/src/icons/Plus";
import { RobotIcon } from "phosphor-react-native/src/icons/Robot";
import { SignOutIcon } from "phosphor-react-native/src/icons/SignOut";
import { SquaresFourIcon } from "phosphor-react-native/src/icons/SquaresFour";
import { StackIcon } from "phosphor-react-native/src/icons/Stack";
import { SunIcon } from "phosphor-react-native/src/icons/Sun";
import { TrashIcon } from "phosphor-react-native/src/icons/Trash";
import { UserIcon } from "phosphor-react-native/src/icons/User";
import { UsersIcon } from "phosphor-react-native/src/icons/Users";
import { WarningIcon } from "phosphor-react-native/src/icons/Warning";
import { XIcon } from "phosphor-react-native/src/icons/X";

const ICONS = {
  "arrow-counter-clockwise": ArrowCounterClockwiseIcon,
  "arrow-left": ArrowLeftIcon,
  "arrow-right": ArrowRightIcon,
  "arrows-left-right": ArrowsLeftRightIcon,
  "arrow-square-out": ArrowSquareOutIcon,
  "book-open": BookOpenIcon,
  "caret-down": CaretDownIcon,
  "caret-right": CaretRightIcon,
  "chat-circle": ChatCircleIcon,
  check: CheckIcon,
  "clipboard-text": ClipboardTextIcon,
  history: ClockCounterClockwiseIcon,
  code: CodeIcon,
  compass: CompassIcon,
  copy: CopyIcon,
  "corners-out": CornersOutIcon,
  desktop: DesktopIcon,
  "dots-three": DotsThreeIcon,
  export: ExportIcon,
  "file-text": FileTextIcon,
  "git-branch": GitBranchIcon,
  "git-commit": GitCommitIcon,
  globe: GlobeIcon,
  graph: GraphIcon,
  info: InfoIcon,
  link: LinkIcon,
  lock: LockIcon,
  search: MagnifyingGlassIcon,
  minus: MinusIcon,
  moon: MoonIcon,
  pencil: PencilSimpleIcon,
  plus: PlusIcon,
  robot: RobotIcon,
  "sign-out": SignOutIcon,
  "squares-four": SquaresFourIcon,
  stack: StackIcon,
  sun: SunIcon,
  trash: TrashIcon,
  user: UserIcon,
  users: UsersIcon,
  warning: WarningIcon,
  x: XIcon,
} satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, color }: { name: IconName; size?: number; color: string }) {
  const C = ICONS[name];
  return <C size={size} color={color} weight="bold" />;
}

/** GitHub's own mark (as the web's `GitHubMark`), not a Phosphor drawing of it. */
export function GitHubMark({ size = 18, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Path
        fill={color}
        d="M8 .2a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.08-2.7-1.08-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.71 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.88.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 .2Z"
      />
    </Svg>
  );
}
