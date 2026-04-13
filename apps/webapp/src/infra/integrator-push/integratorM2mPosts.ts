/**
 * Signed POST helpers for webapp → integrator HTTP (same HMAC style as legacy modules).
 * Used for immediate delivery and for outbox worker retries.
 */
import { createHmac } from "node:crypto";
import { getIntegratorApiUrl, getIntegratorWebhookSecret } from "@/modules/system-settings/integrationRuntime";
import type { ReminderRule } from "@/modules/reminders/types";

function signPayload(timestamp: string, rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("base64url");
}

async function requireM2m(): Promise<{ baseUrl: string; secret: string }> {
  const baseUrl = (await getIntegratorApiUrl()).trim();
  const secret = (await getIntegratorWebhookSecret()).trim();
  if (!baseUrl || !secret) {
    throw new Error("integrator_m2m_unconfigured");
  }
  return { baseUrl, secret };
}

export type SystemSettingsSyncWireInput = {
  key: string;
  scope: "global" | "doctor" | "admin";
  valueJson: { value: unknown };
  updatedBy?: string | null;
};

export async function postSystemSettingsSyncToIntegrator(input: SystemSettingsSyncWireInput): Promise<void> {
  const { baseUrl, secret } = await requireM2m();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({
    key: input.key,
    scope: input.scope,
    valueJson: input.valueJson,
    ...(input.updatedBy != null && input.updatedBy !== "" ? { updatedBy: String(input.updatedBy) } : {}),
  });
  const signature = signPayload(timestamp, body, secret);
  const url = `${baseUrl.replace(/\/$/, "")}/api/integrator/settings/sync`;
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
    throw new Error(`integrator settings/sync ${res.status}: ${text.slice(0, 200)}`);
  }
}

export async function postReminderRuleUpsertToIntegrator(rule: ReminderRule): Promise<void> {
  const { baseUrl, secret } = await requireM2m();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const idempotencyKey = `rule_${rule.id}_${timestamp}`;
  const body = JSON.stringify({
    eventType: "reminder.rule.upserted",
    idempotencyKey,
    payload: {
      integratorRuleId: rule.id,
      integratorUserId: rule.integratorUserId,
      category: rule.category,
      isEnabled: rule.enabled,
      scheduleType: "interval_window",
      timezone: "Europe/Moscow",
      intervalMinutes: rule.intervalMinutes ?? 60,
      windowStartMinute: rule.windowStartMinute,
      windowEndMinute: rule.windowEndMinute,
      daysMask: rule.daysMask,
      contentMode: "none",
    },
  });
  const signature = signPayload(timestamp, body, secret);
  const url = `${baseUrl.replace(/\/$/, "")}/api/integrator/reminders/rules`;
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
    throw new Error(`integrator reminders/rules ${res.status}: ${text.slice(0, 200)}`);
  }
}
