import { isSafeApiErrorCode, isSafeErrorDigest } from '@/shared/http/apiErrorCode';

/**
 * Отказ запроса к нашему API в форме, которую разрешено показать человеку.
 *
 * `message` — либо текст, который сервер сам написал в поле `message` (продуктовая копия
 * маршрута), либо машинный код, либо фиксированная фраза. Произвольное поле `error` из ответа
 * сюда не попадает: до этой правки маршрут с broad catch клал в `error` текст пойманного
 * исключения (SQL драйвера вместе с параметрами), а `apiJson` делал из него `new Error(detail)`,
 * который вызывающий код показывал в toast.
 */
export class ApiRequestError extends Error {
  readonly status: number;
  /** Машинный код: собственный код маршрута либо `http_<status>`. */
  readonly code: string;
  /** Непрозрачный correlation id серверного лога, если маршрут его прислал. */
  readonly digest?: string;

  constructor(input: { status: number; code: string; digest?: string; message: string }) {
    super(input.message);
    this.name = 'ApiRequestError';
    this.status = input.status;
    this.code = input.code;
    this.digest = input.digest;
  }
}

function readSafeCode(value: unknown, status: number): string {
  return isSafeApiErrorCode(value) ? value : `http_${status}`;
}

/**
 * Fetches a JSON endpoint, parses the response, and throws `ApiRequestError` on HTTP/parse/business
 * error. Callers wrap in try/catch to route errors to toast or setError.
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
    const code = res.ok ? 'invalid_json' : `http_${res.status}`;
    throw new ApiRequestError({ status: res.status, code, message: code });
  }
  if (!res.ok || body.ok === false) {
    const code = readSafeCode(body.error, res.status);
    const rawDigest = (body as unknown as { digest?: unknown }).digest;
    const digest = isSafeErrorDigest(rawDigest) ? rawDigest : undefined;
    // `message` пишет сам маршрут как продуктовую копию; `error` — только код.
    const serverText = typeof body.message === 'string' ? body.message.trim() : '';
    throw new ApiRequestError({
      status: res.status,
      code,
      digest,
      message: serverText || code,
    });
  }
  return body;
}
