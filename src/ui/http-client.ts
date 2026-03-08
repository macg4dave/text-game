export interface HttpJsonResult<T> {
  ok: boolean;
  status: number;
  data: T;
  requestId: string | null;
}

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<HttpJsonResult<T>> {
  const response = await fetch(url, options);
  const rawText = await response.text();
  let data: unknown = {};

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { error: rawText };
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data: data as T,
    requestId: response.headers.get("x-request-id")
  };
}

export function formatErrorMessage(
  data: { detail?: string | string[]; error?: string } | undefined,
  fallback: string
): string {
  if (!data) return fallback;
  if (Array.isArray(data.detail)) return data.detail.join(", ");
  return data.detail || data.error || fallback;
}
