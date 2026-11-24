import type { ApiErrorBody, ErrorCode } from "@tablewise/contracts";

export const API_BASE = "/api/v1";

/** A failed API call. Branch on `code` (stable), show `message` (human). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | "NETWORK",
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Field path to message, for VALIDATION_FAILED responses. */
  get fieldErrors(): Record<string, string> {
    const issues = (this.details as { issues?: { path: string; message: string }[] } | undefined)?.issues;
    const out: Record<string, string> = {};
    for (const issue of issues ?? []) {
      const field = issue.path.replace(/^body\./, "");
      out[field] ??= issue.message;
    }
    return out;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  query?: Query | undefined;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal | undefined;
}

const listeners = new Set<() => void>();
/** Called when any request comes back 401: the session expired or was revoked. */
export function onUnauthenticated(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const search = params.toString();
  return `${API_BASE}${path}${search ? `?${search}` : ""}`;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

/**
 * The one place the web app talks HTTP. The session travels as an httpOnly cookie
 * (same origin), so no token is ever readable by page scripts.
 */
export async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      body: options.body === undefined ? null : JSON.stringify(options.body),
      signal: options.signal ?? null,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK", "Can't reach the server. Check the connection and try again.");
  }

  const text = response.status === 204 ? "" : await response.text();
  const json: unknown = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const body = (json as ApiErrorBody | undefined)?.error;
    if (response.status === 401 && path !== "/auth/login") for (const listener of listeners) listener();
    throw new ApiError(
      response.status,
      body?.code ?? "INTERNAL",
      body?.message ?? `Request failed (${response.status})`,
      body?.details,
      body?.requestId,
    );
  }
  return { data: json as T, status: response.status, headers: response.headers };
}

export const http = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) =>
    request<T>("GET", path, { query, signal }).then((response) => response.data),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>("POST", path, { body: body ?? {}, ...(headers ? { headers } : {}) }),
  put: <T>(path: string, body: unknown) =>
    request<T>("PUT", path, { body }).then((response) => response.data),
  patch: <T>(path: string, body: unknown) =>
    request<T>("PATCH", path, { body }).then((response) => response.data),
  delete: (path: string) => request<unknown>("DELETE", path).then(() => undefined),
};
