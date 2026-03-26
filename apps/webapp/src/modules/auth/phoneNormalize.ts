/** Нормализация телефона для РФ (+7). Без зависимостей Node — можно импортировать в клиентских компонентах. */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) {
    digits = "7" + digits.slice(1);
  }
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+${digits}`;
  }
  // Локальный ввод RU mobile без кода страны: 9XXXXXXXXX -> +79XXXXXXXXX.
  if (digits.length === 10 && digits.startsWith("9")) {
    return `+7${digits}`;
  }
  return `+${digits}`;
}
