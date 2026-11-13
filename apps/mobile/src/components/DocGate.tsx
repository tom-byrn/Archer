/** Shows a document's screens once it has loaded; a spinner until then, a note when it's gone. */

import type { ReactNode } from "react";
import { Stack, useRouter } from "expo-router";
import { useDoc } from "@/lib/doc";
import { Button, Empty } from "./ui";

const MISSING = {
  document: "It may have been deleted, or it belongs to another workspace.",
  share: "The link may have been turned off, or mistyped.",
  example: "There's no example by that name.",
} as const;

export function DocGate({ children }: { children: ReactNode }) {
  const d = useDoc();
  const router = useRouter();
  if (d.status === "loading")
    return (
      <>
        <Stack.Screen options={{ title: "" }} />
        <Empty loading />
      </>
    );
  if (d.status === "missing")
    return (
      <>
        <Stack.Screen options={{ title: "" }} />
        <Empty
          icon="file-text"
          title="Document not found"
          body={MISSING[d.kind]}
          action={<Button title="Go back" icon="arrow-left" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />}
        />
      </>
    );
  return children;
}
