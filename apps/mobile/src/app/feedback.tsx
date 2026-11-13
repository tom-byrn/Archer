/** Send feedback, as from the web's footer (`feedback.send`), read on the admin dashboard. */

import { useState } from "react";
import { Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { Button, Input, Screen, Txt } from "@/components/ui";
import { api } from "@/lib/convex";
import { SignedInOnly } from "@/screens/sources";

/** Longest message kept (`convex/feedback.ts` MAX_FEEDBACK). */
const MAX = 4000;

export default function FeedbackRoute() {
  return (
    <SignedInOnly>
      <Feedback />
    </SignedInOnly>
  );
}

function Feedback() {
  const router = useRouter();
  const send = useMutation(api.feedback.send);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await send({
        message,
        path: "/mobile",
        device: `Archer app · ${Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web"} ${Platform.Version ?? ""}`.trim(),
      });
      router.back();
    } catch (e) {
      Alert.alert("Couldn't send it", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <Txt tone="ink2">What's working, what isn't, what you wish it did. It goes straight to the person building Archer.</Txt>
      <Input value={message} onChangeText={setMessage} multiline maxLength={MAX} autoFocus textAlignVertical="top" style={{ minHeight: 180 }} placeholder="Your feedback" />
      <Button title="Send" icon="chat-circle" variant="primary" loading={busy} disabled={message.trim() === ""} onPress={() => void submit()} />
    </Screen>
  );
}
