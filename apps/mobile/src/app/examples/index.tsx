/**
 * The language's worked examples, as the web's docs page shows them
 * (`apps/web/app/language/examples/page.tsx`): the docs tabs, the intro and
 * its numbered list, then a section per example with its summary, "View code",
 * "Open", and the diagram. Bundled with the app, so they work signed out and
 * offline.
 */

import { useRef, useState, type ComponentRef, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { EXAMPLES, type Example } from "@archer/mcp/examples";
import { CodeDialog } from "@/components/CodeDialog";
import { DiagramThumb } from "@/components/Diagram";
import { Band, Frame, SiteFooter, FooterLink, SiteHeader, Wordmark } from "@/components/Site";
import { Button, IconButton, Txt } from "@/components/ui";
import { SITE_URL } from "@/lib/env";
import { MONO, sans } from "@/lib/fonts";
import { useTheme } from "@/lib/theme";

const P = { fontSize: 14, lineHeight: 23 } as const;

/** Summary text with `backtick` spans set as inline code (the page's `withCode`). */
function WithCode({ text }: { text: string }) {
  const { palette } = useTheme();
  return text.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith("`") ? (
      <Txt key={i} style={{ fontFamily: MONO, fontSize: 12.5, color: palette.ink, backgroundColor: palette.surface2 }}>
        {` ${part.slice(1, -1)} `}
      </Txt>
    ) : (
      part
    ),
  );
}

function DocsNav() {
  const { palette } = useTheme();
  const tab = (label: string, active: boolean, onPress?: () => void) => (
    <Pressable key={label} onPress={onPress} hitSlop={6}>
      <Txt
        size="sm"
        tone={active ? "ink" : "ink2"}
        style={[{ fontFamily: MONO }, active && { textDecorationLine: "underline", textDecorationColor: palette.line2 }]}
      >
        {label}
      </Txt>
    </Pressable>
  );
  return (
    <Band>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 20, rowGap: 8, paddingHorizontal: 20, paddingVertical: 20 }}>
        <Txt size="sm" tone="ink3" style={{ fontFamily: MONO }}>
          Docs
        </Txt>
        {tab("Language reference", false, () => void Linking.openURL(`${SITE_URL}/language`))}
        {tab("Examples", true)}
        {tab("MCP server", false, () => void Linking.openURL(`${SITE_URL}/docs/mcp`))}
        {tab("CLI", false, () => void Linking.openURL(`${SITE_URL}/docs/cli`))}
      </View>
    </Band>
  );
}

function Para({ children }: { children: ReactNode }) {
  return (
    <Txt tone="ink2" style={[P, { paddingBottom: 12 }]}>
      {children}
    </Txt>
  );
}

export default function Examples() {
  const router = useRouter();
  const { palette, dark, setChoice } = useTheme();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const offsets = useRef<Record<string, number>>({});
  const [code, setCode] = useState<Example | null>(null);
  const open = (e: Example) => router.push(`/examples/${e.slug}` as Href);

  return (
    <Frame>
      <Stack.Screen options={{ headerShown: false }} />
      <SiteHeader>
        <IconButton icon="chevron-left" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={{ marginLeft: -8 }} />
        <Wordmark />
        <View style={{ marginLeft: "auto" }}>
          <IconButton icon={dark ? "sun" : "moon"} label={dark ? "Switch to light theme" : "Switch to dark theme"} onPress={() => setChoice(dark ? "light" : "dark")} />
        </View>
      </SiteHeader>
      <ScrollView ref={scroller} style={{ flex: 1 }}>
        <DocsNav />
        <Band>
          <View style={{ paddingHorizontal: 20, paddingVertical: 48 }}>
            <Txt size="2xl" weight="700" style={{ letterSpacing: -0.65, paddingBottom: 12 }} accessibilityRole="header">
              Examples
            </Txt>
            <Para>
              Each example is a complete <WithCode text="`.arch`" /> document, shown as the diagram Archer draws from it. Nothing
              is drawn by hand: the images come from the same renderer as share links and README embeds, straight from the
              source. <Txt style={[P, { fontFamily: sans("600"), color: palette.ink }]}>View code</Txt> shows that source, and{" "}
              <Txt style={[P, { fontFamily: sans("600"), color: palette.ink }]}>Open</Txt> puts it on the canvas to explore.
            </Para>
            <Para>
              The first three have no <WithCode text="`layout`" /> block. That is how agents write Archer, and those diagrams
              are the app's auto-layout. The last one is a whole product laid out by hand, so it shows what the canvas writes
              once you arrange things yourself.
            </Para>
            <View style={{ paddingTop: 12 }}>
              {EXAMPLES.map((e, i) => (
                <View key={e.slug} style={{ flexDirection: "row", gap: 12, paddingBottom: 6 }}>
                  <Txt tone="ink3" style={[P, { fontFamily: MONO, width: 16 }]}>
                    {i + 1}
                  </Txt>
                  <Txt style={[P, { flex: 1 }]}>
                    <Txt
                      weight="500"
                      style={P}
                      onPress={() => scroller.current?.scrollTo({ y: offsets.current[e.slug] ?? 0, animated: true })}
                    >
                      {e.title}
                    </Txt>
                    <Txt tone="ink3" style={P}>
                      {" · "}
                      {e.features.join(", ")}
                    </Txt>
                  </Txt>
                </View>
              ))}
            </View>
          </View>
        </Band>

        {EXAMPLES.map((e, i) => (
          <View key={e.slug} onLayout={(ev) => (offsets.current[e.slug] = ev.nativeEvent.layout.y)}>
            <Band last={i === EXAMPLES.length - 1}>
              <View style={{ paddingHorizontal: 20, paddingVertical: 48 }}>
                <Txt size="xl" weight="700" style={{ letterSpacing: -0.5 }} accessibilityRole="header">
                  {e.title}
                </Txt>
                <Txt tone="ink2" style={[P, { paddingTop: 8 }]}>
                  <WithCode text={e.summary} />
                </Txt>
                <View style={{ flexDirection: "row", gap: 8, paddingTop: 16, paddingBottom: 24 }}>
                  <Button size="sm" title="View code" icon="code" onPress={() => setCode(e)} />
                  <Button size="sm" variant="primary" title="Open" icon="open" onPress={() => open(e)} />
                </View>
                <Pressable
                  onPress={() => open(e)}
                  accessibilityRole="button"
                  accessibilityLabel={`The ${e.title} document as Archer draws it`}
                  style={{ borderWidth: 1, borderColor: palette.line, backgroundColor: palette.ground }}
                >
                  <DiagramThumb source={e.source} height={260} padding={16} />
                </Pressable>
              </View>
            </Band>
          </View>
        ))}
        <SiteFooter>
          <FooterLink label="Docs" onPress={() => void Linking.openURL(`${SITE_URL}/language`)} />
        </SiteFooter>
      </ScrollView>
      <CodeDialog open={code !== null} onClose={() => setCode(null)} title={code?.title ?? ""} source={code?.source ?? ""} />
    </Frame>
  );
}
