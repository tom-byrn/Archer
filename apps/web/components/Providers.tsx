"use client";

import { useEffect, useMemo, useRef } from "react";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { api } from "@/convex/_generated/api";
import { takeLegacyWorkspaceId, LEGACY_KEY } from "@/lib/workspace";
import { useIsDark } from "@/lib/useIsDark";

/** Modest Clerk theming so its sign-in card sits inside our token system. */
/** Token values from globals.css — Clerk needs literal colors, not CSS vars. */
const PALETTE = {
  light: {
    primary: "#0c8c5e", primaryInk: "#ffffff",
    surface: "#ffffff", surface2: "#f4f2ee",
    ink: "#1a1916", ink2: "#5f5a52", line: "#e7e3dc", line2: "#d2ccc3", neutral: "#1a1916",
    danger: "#b42318",
  },
  dark: {
    primary: "#23c088", primaryInk: "#08110d",
    surface: "#161719", surface2: "#1c1e21",
    ink: "#ecebe7", ink2: "#a5a19a", line: "#26292d", line2: "#383c42", neutral: "#ecebe7",
    danger: "#f0655a",
  },
} as const;

/**
 * Clerk appearance that follows the page's theme. Both the current (v7)
 * variable names and their legacy aliases are set, since older names are
 * silently ignored by newer Clerk UI builds (which is how text ends up
 * light-on-white in dark mode).
 */
function clerkAppearance(isDark: boolean) {
  const c = isDark ? PALETTE.dark : PALETTE.light;
  return {
    variables: {
      colorPrimary: c.primary,
      colorPrimaryForeground: c.primaryInk,
      colorTextOnPrimaryBackground: c.primaryInk,
      colorBackground: c.surface,
      colorForeground: c.ink,
      colorText: c.ink,
      colorMutedForeground: c.ink2,
      colorTextSecondary: c.ink2,
      colorMuted: c.surface2,
      colorInput: c.surface,
      colorInputBackground: c.surface,
      colorInputForeground: c.ink,
      colorInputText: c.ink,
      colorNeutral: c.neutral,
      colorBorder: c.line,
      colorDanger: c.danger,
      borderRadius: "6px",
      fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
      fontSize: "13px",
    },
    elements: {
      card: { boxShadow: "var(--shadow-md)", border: `1px solid ${c.line}` },
      cardBox: { boxShadow: "var(--shadow-md)", border: `1px solid ${c.line}` },
      footer: { background: c.surface2 },
      socialButtonsBlockButton: "archer-clerk-social",
      socialButtonsBlockButtonText: { color: c.ink },
      formFieldInput: "archer-clerk-input",
      formFieldLabel: { color: c.ink },
      headerTitle: { color: c.ink },
      headerSubtitle: { color: c.ink2 },
      dividerText: { color: c.ink2 },
      dividerLine: { backgroundColor: c.line },
      footerActionText: { color: c.ink2 },
      footerActionLink: { color: c.primary },
      formButtonPrimary: { color: c.primaryInk },
    },
  };
}

/**
 * Once signed in, move any pre-auth anonymous workspace (the UUID this
 * browser generated before login existed) into the user's account.
 */
function LegacyClaim() {
  const { isSignedIn } = useAuth();
  const claim = useMutation(api.workspaces.claimLegacy);
  const attempted = useRef(false);
  useEffect(() => {
    if (!isSignedIn || attempted.current) return;
    attempted.current = true;
    const legacyId = takeLegacyWorkspaceId();
    if (!legacyId) return;
    claim({ legacyId }).catch(() => {
      try {
        localStorage.setItem(LEGACY_KEY, legacyId);
      } catch {}
    });
  }, [isSignedIn, claim]);
  return null;
}

function Missing({ vars }: { vars: { name: string; where: string }[] }) {
  return (
    <div className="grid h-screen place-items-center bg-bg p-8 text-base text-ink-2">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-5">
        <p className="font-semibold text-ink">Archer is not configured yet.</p>
        <p className="pt-1 text-sm">
          Add these to <span className="mono text-ink">apps/web/.env.local</span> and restart{" "}
          <span className="mono text-ink">pnpm dev</span>:
        </p>
        <ul className="pt-3">
          {vars.map((v) => (
            <li key={v.name} className="flex items-baseline gap-2 py-1 text-sm">
              <span className="mono shrink-0 rounded-xs bg-surface-2 px-1.5 py-0.5 text-xs text-ink">
                {v.name}
              </span>
              <span className="text-ink-3">{v.where}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const client = useMemo(() => (convexUrl ? new ConvexReactClient(convexUrl) : null), [convexUrl]);
  const isDark = useIsDark();
  const appearance = useMemo(() => clerkAppearance(isDark), [isDark]);

  const missing = [
    ...(convexUrl
      ? []
      : [{ name: "NEXT_PUBLIC_CONVEX_URL", where: "written by `npx convex dev` in apps/web" }]),
    ...(clerkKey
      ? []
      : [{ name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", where: "Clerk dashboard → API keys" }]),
  ];
  if (!client || missing.length > 0) return <Missing vars={missing} />;

  return (
    <ClerkProvider publishableKey={clerkKey} appearance={appearance}>
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        <LegacyClaim />
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
