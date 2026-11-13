/**
 * The account menu: who you are, the workspace you're in, the theme, the
 * docs, feedback, and signing out.
 */

import { Alert, Image, Linking, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { Icon } from "@/components/Icon";
import { Row, Screen, Section, Segmented, Txt } from "@/components/ui";
import { useAccount } from "@/lib/auth";
import { SITE_URL } from "@/lib/env";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { useWorkspace } from "@/lib/workspace";

export default function Account() {
  const account = useAccount();
  const router = useRouter();
  const { choice, setChoice, palette } = useTheme();
  const { current } = useWorkspace();
  const open = (path: string) => () => void Linking.openURL(`${SITE_URL}${path}`);

  return (
    <Screen>
      {account.isSignedIn && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          {account.imageUrl ? (
            <Image source={{ uri: account.imageUrl }} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: palette.surface2 }} />
          ) : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Txt size="lg" weight="600" numberOfLines={1}>
              {account.name ?? account.githubLogin ?? "Signed in"}
            </Txt>
            <Txt size="sm" tone="ink3" numberOfLines={1}>
              {[account.githubLogin && `@${account.githubLogin}`, account.email].filter(Boolean).join(" · ")}
            </Txt>
          </View>
        </View>
      )}

      {account.isSignedIn && (
        <Section title="Workspace">
          <Row first icon={current?.kind === "team" ? "users" : "user"} title={current?.name ?? "Personal"} detail={current?.role} onPress={() => router.push("/workspaces")} />
        </Section>
      )}

      <Section title="Appearance" plain>
        <Segmented<ThemeChoice>
          value={choice}
          onChange={setChoice}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </Section>

      <Section title="Learn">
        <Row first icon="compass" title="Examples" onPress={() => router.push("/examples")} />
        <Row icon="book-open" title="Language reference" onPress={open("/language")} chevron={false} right={<Ext />} />
        <Row icon="robot" title="Connect an agent (MCP)" onPress={open("/docs/mcp")} chevron={false} right={<Ext />} />
        <Row icon="code" title="The archer CLI" onPress={open("/docs/cli")} chevron={false} right={<Ext />} />
      </Section>

      {account.isSignedIn && (
        <Section>
          <Row first icon="chat-circle" title="Send feedback" onPress={() => router.push("/feedback")} />
          <Row
            icon="sign-out"
            title="Sign out"
            tone="danger"
            chevron={false}
            onPress={() =>
              Alert.alert("Sign out?", undefined, [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Sign out",
                  style: "destructive",
                  onPress: () => {
                    void account.signOut().then(() => router.dismissTo("/welcome"));
                  },
                },
              ])
            }
          />
        </Section>
      )}

      <Txt size="xs" tone="ink3" style={{ textAlign: "center" }}>
        Archer {Constants.expoConfig?.version ?? ""}
      </Txt>
    </Screen>
  );
}

/** Opens in the browser. */
function Ext() {
  const { palette } = useTheme();
  return <Icon name="arrow-square-out" size={14} color={palette.ink3} />;
}
