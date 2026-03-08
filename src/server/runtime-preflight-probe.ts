export interface JsonProbeResult {
  ok: boolean;
  status: number | null;
  body: unknown;
  text: string;
}

export interface JsonProbeRequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface JsonProbeTransport {
  probeJson(url: string, options?: JsonProbeRequestOptions): Promise<JsonProbeResult | Error>;
}

export function createJsonProbeTransport(fetchImpl: typeof fetch = globalThis.fetch): JsonProbeTransport {
  return {
    async probeJson(url: string, options: JsonProbeRequestOptions = {}): Promise<JsonProbeResult | Error> {
      try {
        const response = await fetchImpl(url, {
          headers: options.headers,
          signal: AbortSignal.timeout(options.timeoutMs ?? 5000)
        });
        const text = await response.text();

        return {
          ok: response.ok,
          status: response.status,
          body: parseJson(text),
          text
        };
      } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
      }
    }
  };
}

function parseJson(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
