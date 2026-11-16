/**
 * Signed out: the web's landing page (`components/landing/Landing.tsx`) on a
 * phone. The dithered fade behind the header and hero, the Newsreader
 * headline and lede, "Sign in with GitHub", the agent prompt line, a framed
 * diagram (glyphs, like the landing's sandbox), the footer columns and the
 * big faded wordmark. Sign-in is the web's Clerk instance; without accounts
 * in this build, the examples are what's here.
 */

import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Redirect, Stack, useRouter, type Href } from "expo-router";
import Svg, { Circle, Defs, LinearGradient, Mask, Pattern, Rect, Stop } from "react-native-svg";
import * as AuthSession from "expo-auth-session";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useSSO } from "@clerk/expo";
import { agentPrompt, HEADLINE, LEDE } from "@web/landingCopy";
import { LANDING_SAMPLE_NARROW } from "@web/landingSample";
import { Canvas, useRenderedCanvas } from "@/components/Diagram";
import { OpenLinkDialog } from "@/components/Dialogs";
import { Icon } from "@/components/Icon";
import { Band, FooterLink, Frame, Joints, SiteHeader, Wordmark } from "@/components/Site";
import { Button, IconButton, Txt, withAlpha } from "@/components/ui";
import { useAccount } from "@/lib/auth";
import { SITE_URL } from "@/lib/env";
import { HEADLINE as HEADLINE_FONT, MONO, WORDMARK_BLACK } from "@/lib/fonts";
import { useTheme } from "@/lib/theme";
import { RADIUS, TEXT } from "@/lib/tokens";

/** The landing's dither: its fade color at the top, dissolving into the page over the hero. */
function Backdrop({ height }: { height: number }) {
  const { palette } = useTheme();
  return (
    <Svg width="100%" height={height} style={{ position: "absolute", top: 0, left: 0, right: 0 }} pointerEvents="none">
      <Defs>
        <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={palette.landingFade} stopOpacity="1" />
          <Stop offset="0.55" stopColor={palette.landingFade} stopOpacity="0.35" />
          <Stop offset="1" stopColor={palette.landingFade} stopOpacity="0" />
        </LinearGradient>
        <LinearGradient id="dotsFade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fff" stopOpacity="1" />
          <Stop offset="0.7" stopColor="#fff" stopOpacity="0.5" />
          <Stop offset="1" stopColor="#fff" stopOpacity="0" />
        </LinearGradient>
        <Mask id="dotsMask">
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#dotsFade)" />
        </Mask>
        <Pattern id="dither" patternUnits="userSpaceOnUse" width="3" height="3">
          <Circle cx="1.5" cy="1.5" r="0.85" fill={palette.line2} fillOpacity={0.55} />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#fade)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#dither)" mask="url(#dotsMask)" />
    </Svg>
  );
}

export default function Welcome() {
  const account = useAccount();
  const router = useRouter();
  const { palette, dark, setChoice } = useTheme();
  const { width } = useWindowDimensions();
  const [linkOpen, setLinkOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const sample = useRenderedCanvas(LANDING_SAMPLE_NARROW, [], { logos: false });
  if (account.isSignedIn) return <Redirect href="/" />;
  const bg = palette.landingBg;

  return (
    <Frame bg={bg}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={{ flexGrow: 1 }}>
        <Backdrop height={760} />
        <SiteHeader bg="transparent">
          <Wordmark />
          <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8 }}>
            <IconButton
              icon={dark ? "sun" : "moon"}
              label={dark ? "Switch to light theme" : "Switch to dark theme"}
              onPress={() => setChoice(dark ? "light" : "dark")}
            />
            {account.configured && <SignInButton title="Sign in" variant="secondary" />}
          </View>
        </SiteHeader>

        <Band bg={bg}>
          <View style={{ alignItems: "center", paddingHorizontal: 20, paddingTop: 64, paddingBottom: 56 }}>
            <Txt
              accessibilityRole="header"
              style={[TEXT["display-sm"], { fontFamily: HEADLINE_FONT, letterSpacing: -0.5, color: palette.ink, textAlign: "center", maxWidth: 16 * 22 }]}
            >
              {HEADLINE}
            </Txt>
            <Txt size="lede" tone="ink2" style={{ textAlign: "center", paddingTop: 24, maxWidth: 46 * 8 }}>
              {LEDE}
            </Txt>
            <View style={{ alignItems: "center", gap: 12, paddingTop: 32 }}>
              {account.configured ? (
                <SignInButton title="Sign in with GitHub" variant="primary" size="lg" />
              ) : (
                <Txt size="sm" tone="ink3" style={{ textAlign: "center" }}>
                  Sign-in isn't set up in this build, so the examples are what's here.
                </Txt>
              )}
              <Button title="Browse the examples" icon="diagram" size="lg" onPress={() => router.push("/examples")} />
            </View>
            <Pressable
              onPress={() => {
                void Clipboard.setStringAsync(agentPrompt(SITE_URL));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              accessibilityRole="button"
              accessibilityLabel="Copy the setup prompt for your agent"
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 32, paddingHorizontal: 8 }}
            >
              <Txt size="sm" tone="accent" style={{ fontFamily: MONO }}>
                ❯
              </Txt>
              <Txt size="sm" tone="ink3" style={{ fontFamily: MONO }}>
                Set me up with Archer…
              </Txt>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Icon name={copied ? "check" : "copy"} size={14} color={palette.ink2} />
                <Txt size="sm" tone="ink2" style={{ fontFamily: MONO, textDecorationLine: "underline", textDecorationColor: palette.line2 }}>
                  copy prompt
                </Txt>
              </View>
            </Pressable>
            {account.configured && (
              <Pressable onPress={() => setLinkOpen(true)} hitSlop={8} style={{ paddingTop: 20 }}>
                <Txt size="sm" tone="ink2" style={{ textDecorationLine: "underline", textDecorationColor: palette.line2 }}>
                  Open a share link
                </Txt>
              </Pressable>
            )}
          </View>
        </Band>

        <Band bg={bg}>
          <View style={{ paddingHorizontal: 20, paddingVertical: 40 }}>
            <View style={{ borderWidth: 1, borderColor: palette.line2, backgroundColor: palette.surface, borderRadius: RADIUS.xs, overflow: "hidden" }}>
              <View
                style={{
                  height: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: palette.line,
                }}
              >
                <Txt size="base" tone="ink2" style={{ fontFamily: MONO }}>
                  architecture.arch
                </Txt>
                <Pressable onPress={() => router.push("/examples")} hitSlop={8} style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Txt size="sm" weight="500">
                    See more
                  </Txt>
                  <Icon name="arrow-right" size={14} color={palette.ink} />
                </Pressable>
              </View>
              <View style={{ height: 420 }}>
                <Canvas rendered={sample} />
              </View>
            </View>
          </View>
        </Band>

        <View style={{ flex: 1 }} />
        <View style={{ borderTopWidth: 1, borderTopColor: palette.line }}>
          <Joints top bg={bg} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 32, paddingHorizontal: 20, paddingVertical: 40 }}>
            <View style={{ width: "100%" }}>
              <Wordmark />
              <Txt tone="ink3" style={{ paddingTop: 12, maxWidth: 240 }}>
                {HEADLINE}
              </Txt>
            </View>
            <FooterColumn
              title="Docs"
              links={[
                ["Language reference", () => void Linking.openURL(`${SITE_URL}/language`)],
                ["MCP server", () => void Linking.openURL(`${SITE_URL}/docs/mcp`)],
                ["CLI", () => void Linking.openURL(`${SITE_URL}/docs/cli`)],
              ]}
            />
            <FooterColumn
              title="Product"
              links={[
                ["Examples", () => router.push("/examples")],
                ...(account.configured ? ([["Open a share link", () => setLinkOpen(true)]] as [string, () => void][]) : []),
              ]}
            />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 24, borderTopWidth: 1, borderTopColor: palette.line }}>
            <Txt size="sm" tone="ink3" style={{ marginLeft: "auto" }}>
              © 2026 Archer
            </Txt>
          </View>
          <View style={{ overflow: "hidden", paddingHorizontal: 20, paddingTop: 16, height: Math.round(width * 0.265 * 0.74) + 16 }} pointerEvents="none">
            <Txt
              style={{
                fontFamily: WORDMARK_BLACK,
                fontSize: Math.round(width * 0.265),
                lineHeight: Math.round(width * 0.265 * 0.92),
                letterSpacing: -0.04 * width * 0.265,
                color: withAlpha(palette.ink, 0.11),
              }}
            >
              Archer
            </Txt>
          </View>
        </View>
      </ScrollView>
      {linkOpen && (
        <OpenLinkDialog
          onClose={() => setLinkOpen(false)}
          onOpen={(slug) => {
            setLinkOpen(false);
            router.push(`/share/${slug}` as Href);
          }}
        />
      )}
    </Frame>
  );
}

function FooterColumn({ title, links }: { title: string; links: [string, () => void][] }) {
  return (
    <View style={{ width: "50%" }}>
      <Txt size="xs" tone="ink3" style={{ fontFamily: MONO, textTransform: "uppercase", letterSpacing: 0.9 }}>
        {title}
      </Txt>
      <View style={{ gap: 10, paddingTop: 12 }}>
        {links.map(([label, onPress]) => (
          <FooterLink key={label} label={label} onPress={onPress} />
        ))}
      </View>
    </View>
  );
}

/** Clerk's GitHub sign-in in the system browser, back to the app ("Sign in with GitHub →"). */
function SignInButton({ title, variant, size = "md" }: { title: string; variant: "primary" | "secondary"; size?: "md" | "lg" }) {
  const { startSSOFlow } = useSSO();
  const router = useRouter();
  const { palette } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <View style={{ alignItems: "center", gap: 6 }}>
      <Button
        title={title}
        variant={variant}
        size={size}
        loading={busy}
        onPress={() => void signIn()}
        trailing={size === "lg" ? <Icon name="arrow-right" size={14} color={variant === "primary" ? palette.bg : palette.ink} /> : undefined}
      />
      {error && (
        <Txt size="xs" tone="danger" style={{ textAlign: "center" }}>
          {error}
        </Txt>
      )}
    </View>
  );
}
