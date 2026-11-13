/** Open a share link someone sent (tryarcher.dev/share/…): no account needed. */

import { useState } from "react";
import { View } from "react-native";
import { useRouter, type Href } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Button, Input, Screen, Txt } from "@/components/ui";
import { shareSlugFrom } from "@/lib/links";
import { BackendOnly } from "@/screens/sources";

export default function OpenLinkRoute() {
  return (
    <BackendOnly>
      <OpenLink />
    </BackendOnly>
  );
}

function OpenLink() {
  const router = useRouter();
  const [text, setText] = useState("");
  const slug = shareSlugFrom(text);
  const open = (s: string) => {
    router.dismiss();
    router.push(`/share/${s}` as Href);
  };
  return (
    <Screen>
      <Txt tone="ink2">Paste a link to a shared document. It opens read-only, signed in or not.</Txt>
      <Input
        value={text}
        onChangeText={setText}
        placeholder="https://tryarcher.dev/share/…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        autoFocus
        returnKeyType="go"
        onSubmitEditing={() => slug && open(slug)}
      />
      {text.trim() !== "" && !slug && (
        <Txt size="sm" tone="danger">
          That doesn't look like an Archer share link.
        </Txt>
      )}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button
          title="Paste"
          icon="clipboard-text"
          style={{ flex: 1 }}
          onPress={() => void Clipboard.getStringAsync().then((t) => setText(t))}
        />
        <Button title="Open" icon="arrow-right" variant="primary" style={{ flex: 1 }} disabled={!slug} onPress={() => slug && open(slug)} />
      </View>
    </Screen>
  );
}
