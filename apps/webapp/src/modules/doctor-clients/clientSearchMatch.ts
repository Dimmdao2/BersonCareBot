/** Поиск клиента врачом: имя, телефон (в т.ч. по цифрам без +7), мессенджеры. */
function phoneDigitVariants(phone: string | null): string[] {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return [];
  const variants = [digits];
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    variants.push(digits.slice(1));
  }
  return variants;
}

export function matchesDoctorClientSearch(
  item: {
    displayName: string;
    phone: string | null;
    bindings?: { telegramId?: string | null; maxId?: string | null };
  },
  query: string,
): boolean {
  const s = query.toLowerCase().trim();
  if (!s) return true;
  const searchDigits = s.replace(/\D/g, "");
  const phoneMatches =
    (item.phone ?? "").toLowerCase().includes(s) ||
    (searchDigits.length >= 3 &&
      phoneDigitVariants(item.phone).some((variant) => variant.includes(searchDigits)));
  return (
    item.displayName.toLowerCase().includes(s) ||
    phoneMatches ||
    (item.bindings?.telegramId ?? "").toLowerCase().includes(s) ||
    (item.bindings?.maxId ?? "").toLowerCase().includes(s)
  );
}

export function isDoctorClientSearchQueryAllowed(query: string): boolean {
  const trimmed = query.trim();
  if (trimmed.length >= 2) return true;
  return trimmed.replace(/\D/g, "").length >= 3;
}
