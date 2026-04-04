import { isValidPhoneNumber } from "libphonenumber-js/min";

/**
 * Нормализованный РФ-мобильный: ровно "+7" + 10 цифр (12 символов).
 * Для политики SMS (Stage 4) и определения «РФ-номер или нет».
 */
export function isValidRuMobileNormalized(normalized: string): boolean {
  return /^\+7\d{10}$/.test(normalized);
}

/** Российский мобильный E.164 (+7 и 10 цифр после кода страны). SMS в вебе разрешены только при `true`. */
export function isRuMobile(normalized: string): boolean {
  return isValidRuMobileNormalized(normalized);
}

/**
 * Валидный номер в формате E.164 (международная проверка через libphonenumber).
 */
export function isValidPhoneE164(normalized: string): boolean {
  if (!normalized || normalized.length < 8) return false;
  if (!normalized.startsWith("+")) return false;
  return isValidPhoneNumber(normalized);
}
