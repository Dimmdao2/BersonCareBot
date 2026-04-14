import { createHmac, timingSafeEqual } from "node:crypto";

/** Согласовано с `TELEGRAM_INIT_DATA_MAX_AGE_SEC` в `service.ts` — окно жизни стартовых параметров. */
export const MAX_WEBAPP_INIT_DATA_MAX_AGE_SEC = 3600;

/** Понятная причина отказа без логирования значений полей initData. */
export type MaxInitDataRejectReason =
  | "empty_bot_token"
  | "hash_missing_or_duplicate"
  | "hash_decode_failed"
  | "hash_invalid_hex"
  | "pair_decode_failed"
  | "auth_date_missing"
  | "auth_date_expired"
  | "user_missing"
  | "user_json_invalid"
  | "user_id_missing"
  | "signature_mismatch";

function splitInitDataPairs(raw: string): [string, string][] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  return trimmed.split("&").map((segment) => {
    const i = segment.indexOf("=");
    if (i === -1) return [segment, ""] as [string, string];
    return [segment.slice(0, i), segment.slice(i + 1)] as [string, string];
  });
}

export type ParsedMaxWebAppInitData = {
  maxUserId: string;
  displayName?: string;
  startParam?: string;
};

export type MaxInitParseResult =
  | { ok: true; data: ParsedMaxWebAppInitData }
  | { ok: false; reason: MaxInitDataRejectReason };

/**
 * Проверка подписи стартовых параметров MAX Mini App (`window.WebApp.initData`).
 * Алгоритм: https://dev.max.ru/docs/webapps/validation
 * Возвращает код отказа для диагностики (логи), без утечки секретов.
 */
export function parseMaxWebAppInitDataDetailed(initData: string, botToken: string): MaxInitParseResult {
  const token = botToken.trim();
  if (!token) return { ok: false, reason: "empty_bot_token" };

  const pairs = splitInitDataPairs(initData);
  const hashEntries = pairs.filter(([k]) => k === "hash");
  if (hashEntries.length !== 1) return { ok: false, reason: "hash_missing_or_duplicate" };
  let providedHashHex: string;
  try {
    providedHashHex = decodeURIComponent(hashEntries[0]![1] ?? "").trim().toLowerCase();
  } catch {
    return { ok: false, reason: "hash_decode_failed" };
  }
  if (!providedHashHex || !/^[0-9a-f]+$/i.test(providedHashHex)) {
    return { ok: false, reason: "hash_invalid_hex" };
  }

  const decoded: [string, string][] = [];
  for (const [k, v] of pairs) {
    if (!k) continue;
    try {
      decoded.push([k, decodeURIComponent(v)]);
    } catch {
      return { ok: false, reason: "pair_decode_failed" };
    }
  }

  let authDateNum: number | null = null;
  let userJson: string | null = null;
  let startParam: string | undefined;
  const signPairs: [string, string][] = [];

  for (const [k, v] of decoded) {
    if (k === "hash") continue;
    signPairs.push([k, v]);
    if (k === "auth_date") {
      const n = Number(v);
      if (Number.isFinite(n)) authDateNum = n;
    }
    if (k === "user") userJson = v;
    if (k === "start_param" && v.trim() !== "") startParam = v.trim();
  }

  if (authDateNum == null) return { ok: false, reason: "auth_date_missing" };
  if (Math.floor(Date.now() / 1000) - authDateNum > MAX_WEBAPP_INIT_DATA_MAX_AGE_SEC) {
    return { ok: false, reason: "auth_date_expired" };
  }
  if (!userJson) return { ok: false, reason: "user_missing" };

  let user: { id?: number | string; first_name?: string; last_name?: string };
  try {
    user = JSON.parse(userJson) as { id?: number | string; first_name?: string; last_name?: string };
  } catch {
    return { ok: false, reason: "user_json_invalid" };
  }
  const maxUserId = user.id != null ? String(user.id).trim() : "";
  if (!maxUserId) return { ok: false, reason: "user_id_missing" };

  signPairs.sort((a, b) => a[0].localeCompare(b[0]));
  const launchParams = signPairs.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = createHmac("sha256", Buffer.from("WebAppData", "utf8")).update(token, "utf8").digest();
  const computedHex = createHmac("sha256", secretKey).update(launchParams, "utf8").digest("hex");

  const a = Buffer.from(computedHex, "hex");
  const b = Buffer.from(providedHashHex, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature_mismatch" };
  }

  const fn = typeof user.first_name === "string" ? user.first_name.trim() : "";
  const ln = typeof user.last_name === "string" ? user.last_name.trim() : "";
  const displayName = [fn, ln].filter(Boolean).join(" ").trim() || undefined;

  return {
    ok: true,
    data: {
      maxUserId,
      ...(displayName ? { displayName } : {}),
      ...(startParam ? { startParam } : {}),
    },
  };
}

/**
 * Успешный разбор или `null` (обратная совместимость для вызовов без диагностики).
 */
export function parseMaxWebAppInitDataValidated(
  initData: string,
  botToken: string,
): ParsedMaxWebAppInitData | null {
  const r = parseMaxWebAppInitDataDetailed(initData, botToken);
  return r.ok ? r.data : null;
}
