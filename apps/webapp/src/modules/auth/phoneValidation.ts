/**
 * Нормализованный РФ-мобильный: ровно "+7" + 10 цифр (12 символов).
 * Строже, чем только `length < 12` из EXEC: отсекает лишние цифры и неверный префикс.
 */
export function isValidRuMobileNormalized(normalized: string): boolean {
  return /^\+7\d{10}$/.test(normalized);
}
