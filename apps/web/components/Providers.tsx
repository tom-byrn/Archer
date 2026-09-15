"use client";

import { useEffect, useMemo, useRef } from "react";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexReactClient, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { api } from "@/convex/_generated/api";
import { takeLegacyWorkspaceId, LEGACY_KEY } from "@/lib/workspace";

/** Modest Clerk theming so its sign-in card sits inside our token system. */
const CLERK_APPEARANCE = {
  variables: {
    colorPrimary: "#0c8c5e",
    colorBackground: "#ffffff",
    colorText: "#1a1916",
    colorTextSecondary: "#5f5a52",
    colorInputBackground: "#ffffff",
    colorInputText: "#1a1916",
    colorNeutral: "#1a1916",
    borderRadius: "6px",
    fontFamily: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
    fontSize: "13px",
  },
  elements: {
    card: { boxShadow: "var(--shadow-md)", border: "1px solid #e7e3dc" },
  },
};

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
    <ClerkProvider publishableKey={clerkKey} appearance={CLERK_APPEARANCE}>
      <ConvexProviderWithClerk client={client} useAuth={useAuth}>
        <LegacyClaim />
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
