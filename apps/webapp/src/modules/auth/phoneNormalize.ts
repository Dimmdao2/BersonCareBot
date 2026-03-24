/** Нормализация телефона для РФ (+7). Без зависимостей Node — можно импортировать в клиентских компонентах. */
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (digits.length >= 10 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length >= 10) return `+7${digits}`;
  return `+${digits}`;
}
