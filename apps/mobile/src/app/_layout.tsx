/**
 * The app shell: theme, accounts (Clerk sign-in, Convex with Clerk's token,
 * the selected workspace) when this build has them, and one stack of screens.
 */

import { useEffect, type ReactNode } from "react";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationTheme } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import * as WebBrowser from "expo-web-browser";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
// Only the weight the app uses, so the bundle carries one font file.
import { PlayfairDisplay_600SemiBold } from "@expo-google-fonts/playfair-display/600SemiBold";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ClerkAccountProvider } from "@/lib/auth";
import { CLERK_PUBLISHABLE_KEY, CONVEX_URL } from "@/lib/env";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { WorkspaceProvider } from "@/lib/workspace";

// Completes the GitHub sign-in when the browser hands back to the app.
WebBrowser.maybeCompleteAuthSession();
void SplashScreen.preventAutoHideAsync();

const convex = CONVEX_URL ? new ConvexReactClient(CONVEX_URL, { unsavedChangesWarning: false }) : null;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ PlayfairDisplay_600SemiBold });
  const ready = fontsLoaded || fontError !== null;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <Accounts>
          <Navigation />
        </Accounts>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/** Clerk + Convex + the workspace, when the build is configured; otherwise examples only. */
function Accounts({ children }: { children: ReactNode }) {
  if (!convex || !CLERK_PUBLISHABLE_KEY) return children;
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <ClerkAccountProvider>
          <WorkspaceProvider>{children}</WorkspaceProvider>
        </ClerkAccountProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}

function Navigation() {
  const { palette, dark } = useTheme();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(palette.bg);
  }, [palette.bg]);
  const base = dark ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.accent,
      background: palette.bg,
      card: palette.bg,
      text: palette.ink,
      border: palette.line,
      notification: palette.accent,
    },
  };
  return (
    <NavigationTheme value={theme}>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerTintColor: palette.ink,
          headerStyle: { backgroundColor: palette.bg },
          headerTitleStyle: { fontWeight: "600" },
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: palette.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Documents" }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="sso-callback" options={{ headerShown: false }} />
        <Stack.Screen name="examples/index" options={{ title: "Examples" }} />
        <Stack.Screen name="account" options={{ presentation: "modal", title: "Account" }} />
        <Stack.Screen name="workspaces" options={{ presentation: "modal", title: "Workspaces" }} />
        <Stack.Screen name="new" options={{ presentation: "modal", title: "New document" }} />
        <Stack.Screen name="open-link" options={{ presentation: "modal", title: "Open a share link" }} />
        <Stack.Screen name="feedback" options={{ presentation: "modal", title: "Send feedback" }} />
      </Stack>
    </NavigationTheme>
  );
}
