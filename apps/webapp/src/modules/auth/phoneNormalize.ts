/** Нормализация телефона для РФ (+7). Без зависимостей Node — можно импортировать в клиентских компонентах. */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) {
    // Поддержка международного префикса: 00 7 ... -> 7 ...
    digits = digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = "7" + digits.slice(1);
  }
  if (digits.length === 10) {
    // Локальный РФ-номер без кода страны: добавляем +7.
    digits = `7${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+${digits}`;
  }
  return `+${digits}`;
}
