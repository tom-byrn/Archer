/**
 * Who's using the app, whether or not this build has accounts: screens read
 * `useAccount()` and never Clerk directly, so a build without a Clerk key
 * (examples only) runs the same screens.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuth, useUser } from "@clerk/expo";

export interface Account {
  /** This build can sign in (it has a Convex URL and a Clerk key). */
  configured: boolean;
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  name: string | null;
  email: string | null;
  imageUrl: string | null;
  githubLogin: string | null;
  signOut: () => Promise<void>;
}

const SIGNED_OUT: Account = {
  configured: false,
  isLoaded: true,
  isSignedIn: false,
  userId: null,
  name: null,
  email: null,
  imageUrl: null,
  githubLogin: null,
  signOut: async () => {},
};

const AccountContext = createContext<Account>(SIGNED_OUT);

/** Inside ClerkProvider: the signed-in user, from Clerk. */
export function ClerkAccountProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, signOut } = useAuth();
  const { user } = useUser();
  const value = useMemo<Account>(
    () => ({
      configured: true,
      isLoaded,
      isSignedIn: isSignedIn === true,
      userId: userId ?? null,
      name: user?.fullName ?? user?.username ?? null,
      email: user?.primaryEmailAddress?.emailAddress ?? null,
      imageUrl: user?.imageUrl ?? null,
      githubLogin: user?.externalAccounts.find((a) => a.provider === "github")?.username ?? null,
      signOut: async () => {
        await signOut();
      },
    }),
    [isLoaded, isSignedIn, userId, signOut, user],
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export const useAccount = (): Account => useContext(AccountContext);
