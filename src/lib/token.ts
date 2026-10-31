import * as SecureStore from "expo-secure-store";

// The sign-in key lives in the phone's protected storage. The server keeps only
// a hash of it, so this copy is the only one there is.
const KEY = "mikeronn.session";

export async function readToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    // The phone can lose the key that unlocks this storage, such as after a
    // restore from a backup. Signing in again is the way back.
    await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
    return null;
  }
}

export function saveToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(KEY, token);
}

export function clearToken(): Promise<void> {
  return SecureStore.deleteItemAsync(KEY);
}
