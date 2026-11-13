import { Stack, useRouter } from "expo-router";
import { Button, Empty } from "@/components/ui";

export default function NotFound() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ title: "" }} />
      <Empty
        icon="compass"
        title="Nothing here"
        body="That link doesn't lead anywhere in the app."
        action={<Button title="Go home" icon="arrow-left" onPress={() => router.replace("/")} />}
      />
    </>
  );
}
