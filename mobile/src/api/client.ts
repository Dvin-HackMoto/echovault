// EchoVault mobile — typed fetch wrapper + hub/role storage.
//
// Every request to the hub carries `X-Role` (patient|caregiver) and, for
// caregivers, `X-Caregiver-Id` — the contract enforced by the backend
// middleware (backend/app/middleware/dependencies.py). The saved hub base URL
// and role/caregiver id live in AsyncStorage and are reused on every launch.
//
// All failure modes (missing hub URL, network error, timeout/abort, non-2xx)
// are normalized into ONE `ApiError` type with a `kind` field so screens have
// a single thing to catch and branch on.

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Role } from "../types";

// Namespaced AsyncStorage keys.
const KEY_HUB_URL = "ev.hubUrl";
const KEY_ROLE = "ev.role";
const KEY_CAREGIVER_ID = "ev.caregiverId";

/** Default request timeout (ms). ARCHITECTURE section 5 uses ~8s for the hub. */
const DEFAULT_TIMEOUT_MS = 8000;

/** The one error type screens handle. `kind` tells them what went wrong. */
export type ApiErrorKind = "config" | "network" | "timeout" | "http";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    // Restore the prototype chain (TS target may transpile Error subclassing).
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// ─────────────────────────── hub / role storage ───────────────────────────

/** Read the saved hub base URL (e.g. "http://192.168.1.5:8000"), or null. */
export async function getHubUrl(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_HUB_URL);
}

/** Persist the hub base URL. Trailing slashes are trimmed for clean joins. */
export async function setHubUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(KEY_HUB_URL, url.replace(/\/+$/, ""));
}

/** Read the saved role, or null if a mode has not been picked yet. */
export async function getRole(): Promise<Role | null> {
  const value = await AsyncStorage.getItem(KEY_ROLE);
  return value === "patient" || value === "caregiver" ? value : null;
}

/** Persist the active role. */
export async function setRole(role: Role): Promise<void> {
  await AsyncStorage.setItem(KEY_ROLE, role);
}

/** Read the saved caregiver id (sent as X-Caregiver-Id), or null. */
export async function getCaregiverId(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_CAREGIVER_ID);
}

/** Persist (or clear) the caregiver id. */
export async function setCaregiverId(id: string | null): Promise<void> {
  if (id === null) {
    await AsyncStorage.removeItem(KEY_CAREGIVER_ID);
  } else {
    await AsyncStorage.setItem(KEY_CAREGIVER_ID, id);
  }
}

// ─────────────────────────────── core request ─────────────────────────────

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** JSON body (object) OR a FormData for multipart uploads. */
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Force multipart handling even if body is not a FormData (rarely needed). */
  isFormData?: boolean;
}

/** Build the role headers from storage. */
async function roleHeaders(): Promise<Record<string, string>> {
  const role = (await getRole()) ?? "patient";
  const headers: Record<string, string> = { "X-Role": role };
  if (role === "caregiver") {
    const caregiverId = await getCaregiverId();
    if (caregiverId) {
      headers["X-Caregiver-Id"] = caregiverId;
    }
  }
  return headers;
}

/** Join the saved base URL with a path. Throws a `config` ApiError if unset. */
async function resolveUrl(path: string): Promise<string> {
  const base = await getHubUrl();
  if (!base) {
    throw new ApiError("config", "Hub address is not set yet.");
  }
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Perform a single request and normalize every failure into `ApiError`.
 * Uses AbortController for a hard timeout. For FormData bodies the
 * Content-Type is intentionally left unset so React Native fills in the
 * multipart boundary itself.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const url = await resolveUrl(path);
  const isForm = options.isFormData ?? body instanceof FormData;

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(await roleHeaders()),
    ...headers,
  };

  let payload: BodyInit | undefined;
  if (body != null) {
    if (isForm) {
      payload = body as FormData; // RN sets Content-Type + boundary.
    } else {
      finalHeaders["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: payload,
      signal: controller.signal,
    });
  } catch (err) {
    // AbortController fires an AbortError; everything else is a network fault.
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError("timeout", "The hub took too long to respond.");
    }
    throw new ApiError("network", "Can't reach the hub right now.");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await safeErrorDetail(response);
    throw new ApiError("http", detail, response.status);
  }

  return parseBody<T>(response);
}

/** Pull a human-readable message out of an error response, best effort. */
async function safeErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) {
      return `Request failed (${response.status}).`;
    }
    try {
      const json = JSON.parse(text) as { detail?: unknown };
      if (typeof json.detail === "string") {
        return json.detail;
      }
    } catch {
      // Not JSON — fall through to the raw text.
    }
    return text;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

/** Parse a successful response as JSON, tolerating empty 2xx bodies. */
async function parseBody<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return undefined as unknown as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    // Non-JSON success body (rare); hand back the raw text.
    return text as unknown as T;
  }
}

// ────────────────────────────── thin helpers ──────────────────────────────

export function get<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
  return request<T>(path, { ...options, method: "GET" });
}

export function post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
  return request<T>(path, { ...options, method: "POST", body });
}

export function put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
  return request<T>(path, { ...options, method: "PUT", body });
}

export function del<T>(path: string, options?: Omit<RequestOptions, "method" | "body">): Promise<T> {
  return request<T>(path, { ...options, method: "DELETE" });
}

/** POST a prepared FormData (multipart). */
export function postForm<T>(path: string, form: FormData): Promise<T> {
  return request<T>(path, { method: "POST", body: form, isFormData: true });
}

/** A file part as React Native's fetch expects it for multipart uploads. */
export interface UploadFile {
  uri: string;
  name: string;
  type: string; // MIME, e.g. "image/jpeg" or "audio/m4a"
}

/**
 * Upload one file (photo or audio) under the given form field, optionally with
 * extra text fields. Used by people photo upload and the assistant voice call.
 */
export function uploadFile<T>(
  path: string,
  field: string,
  file: UploadFile,
  extra: Record<string, string> = {},
): Promise<T> {
  const form = new FormData();
  // RN accepts a {uri,name,type} object here; the DOM typings don't, so cast.
  form.append(field, file as unknown as Blob);
  Object.entries(extra).forEach(([key, value]) => form.append(key, value));
  return postForm<T>(path, form);
}

// ─────────────────────────────── health check ─────────────────────────────

/**
 * Check a candidate hub URL against `GET /health` before it is saved (MOB-4).
 * NOTE: the exact `/health` path is the documented HUB-3 contract; it is not
 * implemented backend-side yet, so any non-2xx or network failure is treated
 * as "unreachable". Returns true only on a 2xx response.
 */
export async function checkHealth(baseUrl: string, timeoutMs = 4000): Promise<boolean> {
  const url = `${baseUrl.replace(/\/+$/, "")}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
