import type {
  Account,
  AuthOptions,
  CodeSent,
  Graphs,
  PlanPeriod,
  Portfolio,
  SignedIn,
  Summary,
  Trade,
  TradeInput,
} from "./types";

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

// Told when a request finds nobody signed in, such as when a session ran out
// on another tab. The account provider (account.tsx) listens.
let signedOutListener: (() => void) | undefined;

export function onSignedOut(listener: (() => void) | undefined): void {
  signedOutListener = listener;
}

// Every call to the backend goes through here. The browser sends the session
// cookie by itself, since the API is on the same site as the pages.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, "Could not reach the server.");
  }
  // The sign-in pages expect 401 for a wrong password; anywhere else it means
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

export const api = {
  listTrades: () => request<Trade[]>("/trades"),
  getTrade: (id: number) =>
    // A URL like /trades/abc can't be a trade, so don't bother the server with it.
    Number.isInteger(id)
      ? request<Trade>(`/trades/${id}`)
      : Promise.reject(new ApiError(404, "Trade not found")),
  createTrade: (input: TradeInput) => request<Trade>("/trades", json("POST", input)),
  updateTrade: (id: number, input: TradeInput) => request<Trade>(`/trades/${id}`, json("PUT", input)),
  deleteTrade: (id: number) => request<void>(`/trades/${id}`, { method: "DELETE" }),
  getSummary: () => request<Summary>("/summary"),
  getPortfolio: () => request<Portfolio>("/portfolio"),
  getGraphs: () => request<Graphs>("/graphs"),

  getAccount: () => request<Account>("/me"),
  setPlan: (amount: string, period: PlanPeriod) =>
    request<Account>("/me", json("PATCH", { plan_amount: amount, plan_period: period })),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>(
      "/me/password",
      json("PUT", { current_password: currentPassword, new_password: newPassword }),
    ),
  signOutOtherDevices: () => request<void>("/me/sessions", { method: "DELETE" }),
  deleteAccount: (password: string) => request<void>("/me/delete", json("POST", { password })),
};

/** Signing up, in and out. Codes arrive by email; see app/routers/auth.py. */
export const auth = {
  options: () => request<AuthOptions>("/auth/options"),
  signUp: (email: string, password: string, planAmount: string, planPeriod: PlanPeriod) =>
    request<CodeSent>(
      "/auth/sign-up",
      json("POST", { email, password, plan_amount: planAmount, plan_period: planPeriod }),
    ),
  confirm: (email: string, code: string) =>
    request<SignedIn>("/auth/confirm", json("POST", { email, code })),
  resendCode: (email: string) => request<CodeSent>("/auth/resend-code", json("POST", { email })),
  signIn: (email: string, password: string) =>
    request<SignedIn>("/auth/sign-in", json("POST", { email, password })),
  forgotPassword: (email: string) =>
    request<CodeSent>("/auth/forgot-password", json("POST", { email })),
  resetPassword: (email: string, code: string, newPassword: string) =>
    request<SignedIn>(
      "/auth/reset-password",
      json("POST", { email, code, new_password: newPassword }),
    ),
  signOut: () => request<void>("/auth/sign-out", { method: "POST" }),
};
