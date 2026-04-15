/**
 * Клиентская логика гейта «нужен номер через бота» в Mini App (Telegram / MAX):
 * разбор `/api/me` и ссылки на бота (единая точка для UI).
 */

import { CHANNEL_LIST } from "@/modules/channel-preferences/constants";
import { isMessengerMiniAppHost } from "@/shared/lib/messengerMiniApp";

export type PatientMessengerContactGateDetail = {
  kind: "no_gate" | "need_contact" | "unauthenticated" | "me_unavailable";
  hasTelegram: boolean;
  hasMax: boolean;
};

export async function getPatientMessengerContactGateDetail(): Promise<PatientMessengerContactGateDetail> {
  let res: Response;
  try {
    res = await fetch("/api/me", { credentials: "include" });
  } catch {
    return { kind: "me_unavailable", hasTelegram: false, hasMax: false };
  }
  if (res.status === 401) {
    return { kind: "unauthenticated", hasTelegram: false, hasMax: false };
  }
  /** Не снимаем гейт при 5xx/сетевом сбое: иначе контент откроется без подтверждённого tier patient. */
  if (!res.ok) {
    return { kind: "me_unavailable", hasTelegram: false, hasMax: false };
  }
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    user?: { phone?: string | null; bindings?: { telegramId?: string | null; maxId?: string | null } };
    platformAccess?: {
      tier?: string | null;
    } | null;
    platformAccessUnresolved?: boolean;
  };
  if (!data.ok || !data.user) {
    return { kind: "no_gate", hasTelegram: false, hasMax: false };
  }
  const phone = data.user.phone?.trim();
  const hasTelegram = Boolean((data.user.bindings?.telegramId ?? "").trim());
  const hasMax = Boolean((data.user.bindings?.maxId ?? "").trim());
  /** DB tier lookup failed while `DATABASE_URL` is set — same fail-safe as `patientClientBusinessGate`: do not open by snapshot phone. */
  if ((hasTelegram || hasMax) && data.platformAccessUnresolved === true) {
    return { kind: "me_unavailable", hasTelegram, hasMax };
  }
  /** Tier из БД: patient только при доверенном телефоне; без `platformAccess` — прежняя эвристика по `user.phone` (legacy / без БД). */
  const patientTierOk =
    data.platformAccess != null ? data.platformAccess.tier === "patient" : Boolean(phone);
  if (patientTierOk) {
    return { kind: "no_gate", hasTelegram, hasMax };
  }
  if (hasTelegram || hasMax) {
    return { kind: "need_contact", hasTelegram, hasMax };
  }
  return { kind: "no_gate", hasTelegram, hasMax };
}

/** Ссылка «открыть бота» для экрана привязки контакта (Telegram — из admin-конфига, Max — из канонического списка каналов). */
export async function resolveMessengerContactGateBotHref(
  hasTelegram: boolean,
  hasMax: boolean,
): Promise<string | null> {
  if (hasTelegram) {
    const cfg = (await fetch("/api/auth/telegram-login/config")
      .then((r) => r.json())
      .catch(() => ({}))) as { botUsername?: string | null };
    const u = typeof cfg.botUsername === "string" ? cfg.botUsername.trim().replace(/^@/, "") : "";
    return u ? `https://t.me/${u}` : null;
  }
  if (hasMax) {
    const row = CHANNEL_LIST.find((c) => c.code === "max");
    const url = row?.openUrl?.trim();
    return url && url.length > 0 ? url : null;
  }
  return null;
}

/**
 * После 401, когда неизвестны флаги из `/api/me`: эвристика по окружению (Telegram initData → t.me; иначе в MAX WebView — ссылка на Max-бота).
 */
export async function resolveBotHrefAfterMessengerSessionLoss(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const initData = window.Telegram?.WebApp?.initData?.trim() ?? "";
  if (initData.length > 0) {
    return resolveMessengerContactGateBotHref(true, false);
  }
  if (isMessengerMiniAppHost()) {
    return resolveMessengerContactGateBotHref(false, true);
  }
  return null;
}
