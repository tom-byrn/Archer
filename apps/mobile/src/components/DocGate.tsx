/** Shows a document's screen once it has loaded; a spinner until then, the web's "not found" when it's gone. */

import type { ReactNode } from "react";
import { Stack, useRouter } from "expo-router";
import { useDoc } from "@/lib/doc";
import { Button, Loading, Message } from "./ui";

const MISSING = {
  document: "It may have been deleted, or it belongs to another workspace.",
  share: "The link may have been turned off, or mistyped.",
  example: "There's no example by that name.",
} as const;

export function DocGate({ children }: { children: ReactNode }) {
  const d = useDoc();
  const router = useRouter();
  if (d.status === "ready") return children;
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {d.status === "loading" ? (
        <Loading />
      ) : (
        <Message
          title="Document not found"
          body={MISSING[d.kind]}
          action={<Button title="Back to documents" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />}
        />
      )}
    </>
  );
}
