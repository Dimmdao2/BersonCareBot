export function parseIdTokens(input: unknown): string[] {
  const fromArray = (items: unknown[]): string[] => {
    const out: string[] = [];
    for (const item of items) {
      const token = String(item).trim();
      if (!token) continue;
      if (!out.includes(token)) out.push(token);
    }
    return out;
  };

  if (Array.isArray(input)) {
    return fromArray(input);
  }

  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return fromArray(parsed);
    }
    if (typeof parsed === "string") {
      return parseIdTokens(parsed);
    }
  } catch {
    // Not JSON, parse as free-form token list.
  }

  const parts = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  return [...new Set(parts)];
}
