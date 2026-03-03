export function normalizePhone(input: string): string | null {
  const cleaned = input.trim().replace(/[\s()-]/g, '');

  if (/^\+7\d{10}$/.test(cleaned)) {
    return cleaned;
  }

  if (/^8\d{10}$/.test(cleaned)) {
    return `+7${cleaned.slice(1)}`;
  }

  if (/^7\d{10}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  return null;
}
