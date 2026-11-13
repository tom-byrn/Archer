/** Switch workspace: personal first, then teams; pending invites show but can't be opened yet. */

import { useRouter } from "expo-router";
import { Icon } from "@/components/Icon";
import { Chip, Row, Screen, Section, Txt } from "@/components/ui";
import { useTheme } from "@/lib/theme";
import { useWorkspace } from "@/lib/workspace";
import { SignedInOnly } from "@/screens/sources";

export default function WorkspacesRoute() {
  return (
    <SignedInOnly>
      <Workspaces />
    </SignedInOnly>
  );
}

function Workspaces() {
  const router = useRouter();
  const { palette } = useTheme();
  const { workspaces, workspaceId, select } = useWorkspace();
  return (
    <Screen>
      <Section>
        {workspaces.map((w, i) => (
          <Row
            key={w.id}
            first={i === 0}
            icon={w.kind === "team" ? "users" : "user"}
            title={w.name}
            subtitle={w.pending ? "Invited: open it on the web to join" : undefined}
            chevron={false}
            right={
              w.id === workspaceId ? (
                <Icon name="check" color={palette.accent} />
              ) : (
                <Chip label={w.pending ? "invited" : w.role} />
              )
            }
            onPress={
              w.pending
                ? undefined
                : () => {
                    select(w.id);
                    router.back();
                  }
            }
          />
        ))}
      </Section>
      <Txt size="sm" tone="ink3" style={{ paddingHorizontal: 4 }}>
        Create team workspaces and invite people on the web.
      </Txt>
    </Screen>
  );
}
