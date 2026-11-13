/**
 * Signed out: what Archer is, sign in with GitHub (the web app's Clerk
 * instance, so the same account and workspaces), or look around without one:
 * the language's worked examples, or a share link someone sent.
 */

import { useEffect, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useSSO } from "@clerk/expo";
import { LANDING_SAMPLE_NARROW } from "@web/landingSample";
import { DiagramThumb } from "@/components/Diagram";
import { GitHubMark } from "@/components/Icon";
import { Button, Txt } from "@/components/ui";
import { useAccount } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { RADIUS } from "@/lib/tokens";

export default function Welcome() {
  const account = useAccount();
  const router = useRouter();
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  if (account.isSignedIn) return <Redirect href="/" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: insets.top + 40,
        paddingBottom: insets.bottom + 24,
        gap: 28,
        maxWidth: 560,
        width: "100%",
        alignSelf: "center",
      }}
    >
      <View style={{ gap: 14 }}>
        <Image
          source={require("../../assets/splash-icon.png")}
          style={{ width: 52, height: 52 }}
          accessibilityIgnoresInvertColors
          accessibilityLabel="Archer"
        />
        <Txt display style={{ fontSize: 42, lineHeight: 48 }}>
          Archer
        </Txt>
        <Txt size="xl" tone="ink2" style={{ lineHeight: 30 }}>
          A software architecture tool for you and your agents.
        </Txt>
      </View>

      <View
        style={{
          backgroundColor: palette.ground,
          borderRadius: RADIUS.xl,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.line,
        }}
      >
        <DiagramThumb source={LANDING_SAMPLE_NARROW} height={300} logos={false} />
      </View>

      <Txt tone="ink2">
        Your architecture on your phone: open any document, tap into a component to read its schema
        and connections, and review what your agents changed since you last looked.
      </Txt>

      <View style={{ gap: 10, marginTop: "auto" }}>
        {account.configured ? (
          <GitHubSignIn />
        ) : (
          <Txt size="sm" tone="ink3" style={{ textAlign: "center" }}>
            Sign-in isn't set up in this build, so only the examples are here.
          </Txt>
        )}
        <Button title="Browse examples" icon="compass" onPress={() => router.push("/examples")} />
        {account.configured && (
          <Button title="Open a share link" icon="link" variant="ghost" onPress={() => router.push("/open-link")} />
        )}
      </View>
    </ScrollView>
  );
}

/** "Continue with GitHub": Clerk's OAuth flow in the system browser, back to the app. */
function GitHubSignIn() {
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const { palette } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Android opens the browser faster when it's warmed up first.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    void WebBrowser.warmUpAsync();
    return () => void WebBrowser.coolDownAsync();
  }, []);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: "oauth_github",
        redirectUrl: AuthSession.makeRedirectUri({ path: "sso-callback" }),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace("/");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in didn't finish. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <Button
        title="Continue with GitHub"
        variant="primary"
        loading={busy}
        leading={<GitHubMark color={palette.accentInk} />}
        onPress={() => void signIn()}
      />
      {error && (
        <Txt size="sm" tone="danger" style={{ textAlign: "center" }}>
          {error}
        </Txt>
      )}
    </View>
  );
}
