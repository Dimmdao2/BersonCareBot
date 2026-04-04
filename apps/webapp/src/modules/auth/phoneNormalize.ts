import { parsePhoneNumberFromString } from "libphonenumber-js/min";

/**
 * РФ-only нормализация (цифры, 8→7, 10 цифр без кода страны → +7).
 * Сохранена для совместимости и как fallback после `parsePhoneNumberFromString`.
 */
export function normalizePhoneRuLegacy(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = "7" + digits.slice(1);
  }
  if (digits.length === 10) {
    digits = `7${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+${digits}`;
  }
  return `+${digits}`;
}

/**
 * Нормализация в E.164 там, где это возможно.
 *
 * - Пустая строка → `"+"` (как прежний `normalizePhone`, чтобы не ломать сравнения с «пустым» вводом).
 * - Строки с `+` и валидным международным номером → E.164 из libphonenumber.
 * - Неполные/невалидные `+7…` / `+8…` → fallback на `normalizePhoneRuLegacy`.
 * - Национальный ввод без `+` → сначала разбор с регионом по умолчанию `RU`, иначе legacy RU.
 *
 * Невалидный номер может вернуться как «лучшее приближение»; финальная проверка — `isValidPhoneE164`.
 */
export function normalizePhoneInternational(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) {
    return "+";
  }

  if (trimmed.startsWith("+")) {
    const parsed = parsePhoneNumberFromString(trimmed);
    if (parsed?.isValid()) {
      return parsed.format("E.164");
    }
    const compact = trimmed.replace(/\s/g, "");
    if (compact.startsWith("+7") || compact.startsWith("+8")) {
      return normalizePhoneRuLegacy(trimmed);
    }
    return trimmed;
  }

  const parsedRu = parsePhoneNumberFromString(trimmed, "RU");
  if (parsedRu?.isValid()) {
    return parsedRu.format("E.164");
  }

  return normalizePhoneRuLegacy(trimmed);
}

/** Алиас на `normalizePhoneInternational` (общий импорт в приложении). */
export function normalizePhone(phone: string): string {
  return normalizePhoneInternational(phone);
}
