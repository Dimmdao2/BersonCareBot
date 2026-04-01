import { env } from "@/config/env";
import { relayOutbound } from "@/modules/messaging/relayOutbound";
import { getConfigValue } from "@/modules/system-settings/configAdapter";
import type { IntakeNotificationPort } from "./ports";
import type { IntakeType } from "./types";

function parseIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    }
  } catch {
    // not JSON — comma-separated
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}

export async function loadNotifyTargets(): Promise<{
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
    telegram: dedupe([...parseIds(adminTg), ...parseIds(doctorTg)]),
    max: dedupe([...parseIds(adminMax), ...parseIds(doctorMax)]),
  };
}

export function buildIntakeNotifyText(input: {
  type: IntakeType;
  patientName: string;
  summary: string;
  deepLink: string;
}): string {
  const typeLabel =
    input.type === "lfk" ? "ЛФК (онлайн)" : input.type === "nutrition" ? "Нутрициология (онлайн)" : String(input.type);
  const summaryPart = input.summary ? `\n${input.summary.slice(0, 200)}` : "";
  return `Новая заявка: ${typeLabel}\nПациент: ${input.patientName}${summaryPart}\n${input.deepLink}`;
}

export function buildIntakeDeepLink(): string {
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  return `${base}/app/doctor/online-intake`;
}

export async function sendToTargets(
  messageId: string,
  targets: { telegram: string[]; max: string[] },
  text: string,
): Promise<void> {
  const sends: Promise<void>[] = [];
  for (const id of targets.telegram) {
    sends.push(
      relayOutbound({ messageId: `${messageId}:tg:${id}`, channel: "telegram", recipient: id, text })
        .then((r) => {
          console.info("[intake-notify] telegram", id, r.ok ? r.status : r.reason);
        })
        .catch((e) => {
          console.warn("[intake-notify] telegram error", id, e instanceof Error ? e.message : e);
        }),
    );
  }
  for (const id of targets.max) {
    sends.push(
      relayOutbound({ messageId: `${messageId}:max:${id}`, channel: "max", recipient: id, text })
        .then((r) => {
          console.info("[intake-notify] max", id, r.ok ? r.status : r.reason);
        })
        .catch((e) => {
          console.warn("[intake-notify] max error", id, e instanceof Error ? e.message : e);
        }),
    );
  }
  await Promise.allSettled(sends);
}

export function createIntakeNotificationRelay(): IntakeNotificationPort {
  return {
    async notifyNewIntakeRequest(input) {
      const targets = await loadNotifyTargets();
      const deepLink = buildIntakeDeepLink();
      const text = buildIntakeNotifyText({
        type: input.type,
        patientName: input.patientName,
        summary: input.summary,
        deepLink,
      });
      await sendToTargets(input.requestId, targets, text);
    },
  };
}
