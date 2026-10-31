import type {
  AuthOptions,
  Account,
  CodeSent,
  Portfolio,
  SignedIn,
  Summary,
  Trade,
} from "./types";

/** The server, which is also the website. Set EXPO_PUBLIC_API_URL to try another. */
export const SERVER = process.env.EXPO_PUBLIC_API_URL ?? "https://mikeronn.onrender.com";

// The free host sleeps when idle and takes up to a minute to wake, so a slow
// answer isn't a failed one.
const TIMEOUT_MS = 75_000;

/** A failed API call. `fields` holds one message per rejected form field. */
export class ApiError extends Error {
  readonly status: number;
  readonly fields: Record<string, string>;

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

interface ValidationIssue {
  loc: (string | number)[];
  msg: string;
}

function toApiError(status: number, body: unknown): ApiError {
  const detail = (body as { detail?: unknown } | null)?.detail;
  // FastAPI reports rejected input as a list with one entry per field.
  if (Array.isArray(detail)) {
    const fields: Record<string, string> = {};
    for (const issue of detail as ValidationIssue[]) {
      const field = issue.loc.at(-1);
      if (field !== undefined) fields[String(field)] = issue.msg;
    }
    return new ApiError(status, "Please check the highlighted fields.", fields);
  }
  return new ApiError(status, typeof detail === "string" ? detail : `Request failed (${status}).`);
}

// The key sent with every request. The session provider (session.tsx) sets it.
let token: string | null = null;

export function setApiToken(next: string | null): void {
  token = next;
}

// Told when a request finds the key no longer works, such as after signing out
// of other devices on the website. The session provider listens.
let signedOutListener: (() => void) | undefined;

export function onSignedOut(listener: (() => void) | undefined): void {
  signedOutListener = listener;
}

// Every call to the server goes through here.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${SERVER}/api${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, "Could not reach the server.");
  } finally {
    clearTimeout(timer);
  }
  // The sign-in screen expects 401 for a wrong password; anywhere else it means
  // the session is gone.
  if (response.status === 401 && !path.startsWith("/auth/")) signedOutListener?.();
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw toApiError(response.status, body);
  return body as T;
}

function json(method: string, data: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) };
}

// `client: "app"` asks for the key in the answer, rather than as a browser's cookie.
const APP = { client: "app" };

export const api = {
  listTrades: () => request<Trade[]>("/trades"),
  getSummary: () => request<Summary>("/summary"),
  getPortfolio: () => request<Portfolio>("/portfolio"),
  getAccount: () => request<Account>("/me"),
};

/** Signing in and out. Codes arrive by email; see app/routers/auth.py on web-application. */
export const auth = {
  options: () => request<AuthOptions>("/auth/options"),
  signIn: (email: string, password: string) =>
    request<SignedIn>("/auth/sign-in", json("POST", { email, password, ...APP })),
  confirm: (email: string, code: string) =>
    request<SignedIn>("/auth/confirm", json("POST", { email, code, ...APP })),
  resendCode: (email: string) => request<CodeSent>("/auth/resend-code", json("POST", { email })),
  /** Ends the session on the server. Takes the key, as it is forgotten here first. */
  signOut: (key: string) =>
    request<void>("/auth/sign-out", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
    }),
};
