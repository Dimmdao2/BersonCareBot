/**
 * Fetches a JSON endpoint, parses the response, and throws on HTTP/parse/business error.
 * Callers wrap in try/catch to route errors to toast or setError.
 */
export async function apiJson<T extends { ok?: boolean; error?: string; message?: string }>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    throw new Error(res.ok ? "invalid_json" : `http_${res.status}`);
  }
  if (!res.ok || body.ok === false) {
    const detail = typeof body.message === "string" ? body.message : body.error;
    throw new Error(detail ?? `http_${res.status}`);
  }
  return body;
}
