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

/**
 * Text from a client-LOCAL action-result shape (`{ ok: false; error?: string }`, the convention
 * used by `'use server'` actions and `saveDraft()`-style hooks in this codebase) whose `error`
 * field the action itself always populates with dictionary-backed or otherwise pre-vetted text —
 * never a machine code. Kept distinct from `readSafeApiErrorText`'s `message` field, which is the
 * convention for a parsed `fetch(...).json()` body from OUR OWN API routes (where `error` is a
 * machine code by contract, see this file's header comment, and must never reach the reader raw).
 *
 * G3 (safety audit, extended repo-wide sweep, 2026-09-13): `notificationText.<key>` is the same
 * dictionary reference either way, so this is only a naming/plumbing distinction; the coverage
 * gate treats a call to this helper exactly like `readSafeApiErrorText` — a bare `.error` read
 * NOT routed through one of these two helpers is what the gate flags.
 *
 * Re-audit finding (NEW-1, 13.09): the parameter used to be `unknown`, which let a parsed API body
 * be handed to this helper — and because the gate trusts the helper by name, that would have shown
 * a machine code (`invalid_body`, `blocked`) to a human WITH the gate green: exactly the defect G3
 * exists to stop, rubber-stamped. Требование `ok: boolean` (не `ok?:`) отклоняет на компиляции
 * разобранное тело API-ответа, где поле необязательно. Это структурная типизация, а не гарантия:
 * тело, у которого `ok` объявлен обязательным, пройдёт. Поэтому правило остаётся и в ревью —
 * `error` из ответа НАШЕГО API читается только через `readSafeApiErrorText`.
 */
export type ServerActionResultWithUserText = {
  /** Есть всегда у состояния server action; у разобранного тела API-ответа — необязательно. */
  ok: boolean;
  /** Текст для человека, который сам action и положил, а не машинный код. */
  error?: string | null;
};

export function readSafeActionErrorText(
  result: ServerActionResultWithUserText | null | undefined,
  fallback: string,
): string {
  const error = result?.error;
  if (typeof error === 'string' && error.trim()) return error.trim();
  return fallback;
}
