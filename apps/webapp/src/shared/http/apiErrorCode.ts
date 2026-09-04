/**
 * Форма машинного кода ошибки API: строчные ASCII-слова через `_`, опционально один
 * `:<аргумент>` (так уже устроены существующие коды вроде `invalid_break_range:2`).
 *
 * Зачем форма, а не «любая строка»: до этой правки поле `error` в ответе несло либо код,
 * либо произвольный `Error.message` пойманного исключения — то есть текст драйвера БД вместе
 * с SQL и параметрами. Код по этой форме физически не может нести ни пробел, ни перенос
 * строки, ни кавычку, ни кириллицу, ни `select ... params: ...`, поэтому клиент, принимающий
 * только такую строку, не может показать человеку чужой текст, даже если маршрут его пришлёт.
 */
const SAFE_API_ERROR_CODE_RE = /^[a-z][a-z0-9_]*(?::[A-Za-z0-9_.-]{1,64})?$/;

export const MAX_SAFE_API_ERROR_CODE_LENGTH = 96;

export function isSafeApiErrorCode(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_SAFE_API_ERROR_CODE_LENGTH &&
    SAFE_API_ERROR_CODE_RE.test(value)
  );
}

/**
 * Непрозрачный correlation id из серверного лога (`logServerRuntimeError`): hex, без значений.
 */
export function isSafeErrorDigest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]{4,64}$/.test(value);
}

/**
 * Текст отказа для человека из ответа нашего маршрута, для клиентов на «голом» `fetch`.
 *
 * Читается только поле `message` — продуктовая копия, которую написал сам маршрут. Поле `error`
 * сюда не попадает: до этой правки маршруты с broad catch клали в него текст пойманного
 * исключения, а клиенты писали `data?.error ?? 'Не удалось …'` и показывали его человеку.
 */
export function readSafeApiErrorText(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return fallback;
}
