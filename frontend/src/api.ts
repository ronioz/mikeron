import type { Portfolio, Summary, Trade, TradeInput } from "./types";

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

// Every call to the backend goes through here, which makes it the one place
// to attach a login token once the app has user accounts.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError(0, "Could not reach the server.");
  }
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
};
