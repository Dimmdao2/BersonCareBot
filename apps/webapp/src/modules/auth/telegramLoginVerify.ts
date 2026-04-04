import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/** Максимальный возраст `auth_date` (секунды), как в документации Telegram Login Widget. */
export const TELEGRAM_LOGIN_AUTH_MAX_AGE_SEC = 3600;

export type TelegramLoginWidgetPayload = Record<string, string | number | undefined>;

/**
 * Проверка авторизации Telegram Login Widget:
 * `secret_key = SHA256(bot_token)`, `hash = HMAC-SHA256(secret_key, data_check_string)`.
 * @see https://core.telegram.org/widgets/login#checking-authorization
 */
export function verifyTelegramLoginWidgetSignature(
  payload: TelegramLoginWidgetPayload,
  botToken: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): { ok: true; telegramId: string } | { ok: false; reason: "missing_fields" | "bad_hash" | "expired" } {
  const token = botToken.trim();
  if (!token) return { ok: false, reason: "missing_fields" };

  const hashRaw = payload.hash;
  if (typeof hashRaw !== "string" || !hashRaw.trim()) {
    return { ok: false, reason: "missing_fields" };
  }
  const hash = hashRaw.trim().toLowerCase();

  const idRaw = payload.id;
  const id = idRaw != null && idRaw !== "" ? String(idRaw).trim() : "";
  if (!id) return { ok: false, reason: "missing_fields" };

  const authDateRaw = payload.auth_date;
  if (authDateRaw == null || authDateRaw === "") return { ok: false, reason: "missing_fields" };
  const authTs = typeof authDateRaw === "number" ? authDateRaw : Number(String(authDateRaw).trim());
  if (!Number.isFinite(authTs)) return { ok: false, reason: "missing_fields" };
  if (nowSec - authTs > TELEGRAM_LOGIN_AUTH_MAX_AGE_SEC) {
    return { ok: false, reason: "expired" };
  }
  if (authTs - nowSec > 60) {
    return { ok: false, reason: "expired" };
  }

  const pairs: [string, string][] = [];
  for (const [key, val] of Object.entries(payload)) {
    if (key === "hash") continue;
    if (val === undefined || val === null) continue;
    pairs.push([key, String(val)]);
  }
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = createHash("sha256").update(token).digest();
  const computedHex = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return { ok: false, reason: "bad_hash" };
  }
  const left = Buffer.from(computedHex, "hex");
  const right = Buffer.from(hash, "hex");
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false, reason: "bad_hash" };
  }

  return { ok: true, telegramId: id };
}
