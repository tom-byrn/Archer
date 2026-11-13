import { Platform, Share } from "react-native";

/** Hand a link to the system share sheet. */
export async function shareLink(title: string, url: string): Promise<void> {
  await Share.share(Platform.OS === "ios" ? { url, title } : { message: url, title });
}
