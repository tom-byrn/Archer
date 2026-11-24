/**
 * Small preferences kept on the device (theme, last workspace). Secure store
 * on iOS and Android, localStorage in a browser; failures read as "unset".
 */

import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export async function getPref(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(key) ?? null;
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setPref(key: string, value: string | null): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (value === null) globalThis.localStorage?.removeItem(key);
      else globalThis.localStorage?.setItem(key, value);
      return;
    }
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {}
}
