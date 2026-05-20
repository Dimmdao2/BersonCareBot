import { getConfigValue } from "@/modules/system-settings/configAdapter";
import { relayOutbound, type RelayInlineButton } from "@/modules/messaging/relayOutbound";
import { parseIdTokens } from "@/shared/parsers/parseIdTokens";

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}

export async function loadDoctorNotifyTargets(): Promise<{
  telegram: string[];
  max: string[];
}> {
  const [adminTg, adminMax, doctorTg, doctorMax] = await Promise.all([
    getConfigValue("admin_telegram_ids", ""),
    getConfigValue("admin_max_ids", ""),
    getConfigValue("doctor_telegram_ids", ""),
    getConfigValue("doctor_max_ids", ""),
  ]);
  return {
    telegram: dedupe([...parseIdTokens(adminTg), ...parseIdTokens(doctorTg)]),
    max: dedupe([...parseIdTokens(adminMax), ...parseIdTokens(doctorMax)]),
  };
}

export async function relayTextToDoctorTargets(
  messageIdPrefix: string,
  targets: { telegram: string[]; max: string[] },
  text: string,
  logTag: string,
  replyMarkup?: { inline_keyboard: RelayInlineButton[][] },
): Promise<void> {
  const sends: Promise<void>[] = [];
  for (const id of targets.telegram) {
    sends.push(
      relayOutbound({
        messageId: `${messageIdPrefix}:tg:${id}`,
        channel: "telegram",
        recipient: id,
        text,
        ...(replyMarkup ? { replyMarkup } : {}),
      })
        .then((r) => {
          console.info(`[${logTag}] telegram`, id, r.ok ? r.status : r.reason);
        })
        .catch((e) => {
          console.warn(`[${logTag}] telegram error`, id, e instanceof Error ? e.message : e);
        }),
    );
  }
  for (const id of targets.max) {
    sends.push(
      relayOutbound({
        messageId: `${messageIdPrefix}:max:${id}`,
        channel: "max",
        recipient: id,
        text,
        ...(replyMarkup ? { replyMarkup } : {}),
      })
        .then((r) => {
          console.info(`[${logTag}] max`, id, r.ok ? r.status : r.reason);
        })
        .catch((e) => {
          console.warn(`[${logTag}] max error`, id, e instanceof Error ? e.message : e);
        }),
    );
  }
  await Promise.allSettled(sends);
}
