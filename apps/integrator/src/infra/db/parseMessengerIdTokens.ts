import { z } from 'zod';

const idTokenSchema = z.union([z.string(), z.number(), z.boolean()]).transform((v) => String(v).trim());

const idTokensFromArraySchema = z.array(z.unknown()).transform((items) => {
  const out: string[] = [];
  for (const item of items) {
    const parsed = idTokenSchema.safeParse(item);
    if (!parsed.success || !parsed.data) continue;
    if (!out.includes(parsed.data)) out.push(parsed.data);
  }
  return out;
});

function tryDecodeStructuredJsonText(raw: string): unknown | undefined {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{') && !trimmed.startsWith('"')) {
    return undefined;
  }
  try {
    const decoded = JSON.parse(trimmed);
    const validated = z.json().safeParse(decoded);
    return validated.success ? validated.data : undefined;
  } catch {
    return undefined;
  }
}

function tokensFromDecodedJson(decoded: unknown, raw: string): string[] | undefined {
  if (Array.isArray(decoded)) {
    const fromJson = idTokensFromArraySchema.safeParse(decoded);
    if (fromJson.success && fromJson.data.length > 0) return fromJson.data;
    return [];
  }
  if (typeof decoded === 'string' && decoded.trim() !== raw) {
    return parseMessengerIdTokens(decoded);
  }
  return undefined;
}

/** Parse admin settings messenger id lists (array, JSON string, or comma/semicolon separated). */
export function parseMessengerIdTokens(input: unknown): string[] {
  if (Array.isArray(input)) {
    const parsed = idTokensFromArraySchema.safeParse(input);
    return parsed.success ? parsed.data : [];
  }

  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return [];

  const decoded = tryDecodeStructuredJsonText(raw);
  if (decoded !== undefined) {
    const fromJson = tokensFromDecodedJson(decoded, raw);
    if (fromJson !== undefined) return fromJson;
  }

  const parts = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  return [...new Set(parts)];
}
