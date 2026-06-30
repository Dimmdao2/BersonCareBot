export type ParsedFullName = {
  lastName: string | null;
  firstName: string | null;
  patronymic: string | null;
};

/**
 * Parse a Russian full name string into structured components.
 * Rules:
 *  3+ words → last first patronymic (extra words joined into patronymic)
 *  2 words  → last first
 *  1 word   → firstName only (may be a last name in practice, but we store in firstName)
 *  0 words  → all null
 */
export function parseFullName(raw: string | null | undefined): ParsedFullName {
  if (!raw?.trim()) return { lastName: null, firstName: null, patronymic: null };
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 3) {
    return {
      lastName: parts[0]!,
      firstName: parts[1]!,
      patronymic: parts.slice(2).join(" "),
    };
  }
  if (parts.length === 2) {
    return { lastName: parts[0]!, firstName: parts[1]!, patronymic: null };
  }
  return { lastName: null, firstName: parts[0]!, patronymic: null };
}

/**
 * Format FIO for display to doctor: "Иванов Иван Иванович".
 * Returns "—" if all parts are empty/null.
 */
export function formatFioForDoctor(
  lastName: string | null | undefined,
  firstName: string | null | undefined,
  patronymic: string | null | undefined,
): string {
  return [lastName, firstName, patronymic].filter(Boolean).join(" ") || "—";
}
