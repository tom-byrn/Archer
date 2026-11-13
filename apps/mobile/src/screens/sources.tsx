/**
 * Route wrappers: each document screen works on whatever `useDoc()` holds,
 * so a route only says where its document comes from. Stored documents need
 * a signed-in account; share links only a configured backend; examples
 * nothing at all.
 */

import type { ComponentType, ReactNode } from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { Empty } from "@/components/ui";
import { useAccount } from "@/lib/auth";
import { ExampleDocProvider, SharedDocProvider, StoredDocProvider } from "@/lib/doc";

const NOT_CONFIGURED = (
  <Empty
    icon="lock"
    title="Accounts aren't set up"
    body="This build has no Convex URL or Clerk key, so it can only show the examples. See apps/mobile/.env.example."
  />
);

/** Signed-in screens: the welcome screen until there's an account. */
export function SignedInOnly({ children }: { children: ReactNode }) {
  const a = useAccount();
  if (!a.configured) return NOT_CONFIGURED;
  if (!a.isLoaded) return <Empty loading />;
  if (!a.isSignedIn) return <Redirect href="/welcome" />;
  return children;
}

/** Screens that read the backend but need no account (share links). */
export function BackendOnly({ children }: { children: ReactNode }) {
  return useAccount().configured ? children : NOT_CONFIGURED;
}

export const stored = (Screen: ComponentType) =>
  function StoredRoute() {
    const { id } = useLocalSearchParams<{ id: string }>();
    return (
      <SignedInOnly>
        <StoredDocProvider id={id}>
          <Screen />
        </StoredDocProvider>
      </SignedInOnly>
    );
  };

export const shared = (Screen: ComponentType) =>
  function SharedRoute() {
    const { slug } = useLocalSearchParams<{ slug: string }>();
    return (
      <BackendOnly>
        <SharedDocProvider slug={slug}>
          <Screen />
        </SharedDocProvider>
      </BackendOnly>
    );
  };

export const example = (Screen: ComponentType) =>
  function ExampleRoute() {
    const { slug } = useLocalSearchParams<{ slug: string }>();
    return (
      <ExampleDocProvider slug={slug}>
        <Screen />
      </ExampleDocProvider>
    );
  };
