// Used only when the app is previewed in a browser, which has no protected
// storage. Nothing runs this on a phone: there, token.ts is used instead.
const KEY = "mikeronn.session";

export async function readToken(): Promise<string | null> {
  return localStorage.getItem(KEY);
}

export async function saveToken(token: string): Promise<void> {
  localStorage.setItem(KEY, token);
}

export async function clearToken(): Promise<void> {
  localStorage.removeItem(KEY);
}
