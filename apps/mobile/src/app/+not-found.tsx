import { Stack, useRouter } from "expo-router";
import { Button, Message } from "@/components/ui";

export default function NotFound() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Message title="Nothing here" body="That link doesn't lead anywhere in the app." action={<Button title="Go home" onPress={() => router.replace("/")} />} />
    </>
  );
}
