/**
 * Fire-and-forget нотификация integrator об изменении правила напоминания.
 * HMAC-подпись как в relay outbound (Pack C).
 * При ошибке — warn; БД-состояние является source of truth.
 */
import { createHmac } from "node:crypto";
import { env } from "@/config/env";
import type { ReminderRule } from "./types";

function getSecret(): string {
  return env.INTEGRATOR_WEBHOOK_SECRET?.trim() || env.INTEGRATOR_SHARED_SECRET?.trim() || "";
}

function signPayload(timestamp: string, rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("base64url");
}

export async function notifyIntegratorRuleUpdated(rule: ReminderRule): Promise<void> {
  const baseUrl = env.INTEGRATOR_API_URL?.trim();
  const secret = getSecret();

  if (!baseUrl || !secret) {
    console.warn("[reminders] notifyIntegrator: INTEGRATOR_API_URL or secret not configured, skipping");
    return;
  }

  const timestamp = Date.now().toString();
  const idempotencyKey = `rule_${rule.id}_${timestamp}`;
  const body = JSON.stringify({
    eventType: "reminder.rule.upserted",
    rule,
    idempotencyKey,
  });
  const signature = signPayload(timestamp, body, secret);

  const url = `${baseUrl}/api/integrator/reminders/rules`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bersoncare-timestamp": timestamp,
      "x-bersoncare-signature": signature,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`integrator responded ${res.status}: ${text.slice(0, 200)}`);
  }
}
