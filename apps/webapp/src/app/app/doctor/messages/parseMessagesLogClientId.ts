import { z } from "zod";

const uuidSchema = z.string().uuid();

/**
 * Парсинг clientId из query журнала сообщений: только валидный UUID проходит в фильтр.
 * При reset — фильтр пустой. Невалидное непустое значение — сигнал очистить URL (redirect).
 */
export function parseMessagesLogClientId(
  raw: string | undefined,
  resetRequested: boolean,
): { clientId: string; invalidClientIdPresent: boolean } {
  if (resetRequested) return { clientId: "", invalidClientIdPresent: false };
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { clientId: "", invalidClientIdPresent: false };
  if (uuidSchema.safeParse(trimmed).success) return { clientId: trimmed, invalidClientIdPresent: false };
  return { clientId: "", invalidClientIdPresent: true };
}
