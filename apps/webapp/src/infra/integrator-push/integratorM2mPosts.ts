/**
 * Signed POST helpers for webapp → integrator HTTP (same HMAC style as legacy modules).
 * Used for immediate delivery and for outbox worker retries.
 */
import { createHmac } from 'node:crypto';
import { getCurrentCorrelationIdHeader } from '@bersoncare/db-principal';
import {
  getIntegratorApiUrl,
  getIntegratorWebhookSecret,
} from '@/modules/system-settings/integrationRuntime';
import { buildReminderDeepLink } from '@/modules/reminders/buildReminderDeepLink';
import { env } from '@/config/env';
import type { ReminderRule } from '@/modules/reminders/types';

function signPayload(timestamp: string, rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('base64url');
}

async function requireM2m(): Promise<{ baseUrl: string; secret: string }> {
  const baseUrl = (await getIntegratorApiUrl()).trim();
  const secret = (await getIntegratorWebhookSecret()).trim();
  if (!baseUrl || !secret) {
    throw new Error('integrator_m2m_unconfigured');
  }
  return { baseUrl, secret };
}

/** Maps webapp `ReminderRule` store/representation to integrator `user_reminder_rules.category` / templates. */
function integratorCategoryFromRule(rule: ReminderRule): string {
  if (rule.linkedObjectType === 'rehab_program') return 'exercise';
  if (rule.category === 'lfk') return 'exercise';
  if (rule.category === 'appointment') return 'supplements_medication';
  if (rule.category === 'chat') return 'breathing';
  if (rule.category === 'important') return 'water';
  return 'exercise';
}

export async function postReminderRuleUpsertToIntegrator(
  rule: ReminderRule,
  existingIdempotencyKey?: string,
): Promise<void> {
  if (!rule.integratorUserId) return;
  const { baseUrl, secret } = await requireM2m();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const idempotencyKey = existingIdempotencyKey ?? `reminder_rule:${rule.id}`;
  const customTitleForIntegrator =
    rule.customTitle?.trim() ||
    (rule.linkedObjectType === 'rehab_program' ? rule.displayTitle?.trim() || null : null) ||
    null;
  const body = JSON.stringify({
    eventType: 'reminder.rule.upserted',
    idempotencyKey,
    payload: {
      integratorRuleId: rule.id,
      integratorUserId: rule.integratorUserId,
      category: integratorCategoryFromRule(rule),
      isEnabled: rule.enabled,
      scheduleType: rule.scheduleType ?? 'interval_window',
      timezone: rule.timezone?.trim() || 'Europe/Moscow',
      intervalMinutes: rule.intervalMinutes ?? 60,
      windowStartMinute: rule.windowStartMinute,
      windowEndMinute: rule.windowEndMinute,
      daysMask: rule.daysMask,
      contentMode: 'none',
      linkedObjectType: rule.linkedObjectType,
      linkedObjectId: rule.linkedObjectId,
      customTitle: customTitleForIntegrator,
      customText: rule.customText?.trim() || null,
      deepLink: buildReminderDeepLink({
        linkedObjectType: rule.linkedObjectType,
        linkedObjectId: rule.linkedObjectId,
        reminderIntent: rule.reminderIntent ?? null,
        appBaseUrl: env.APP_BASE_URL,
      }),
      scheduleData: rule.scheduleData,
      reminderIntent: rule.reminderIntent ?? 'generic',
      quietHoursStartMinute: rule.quietHoursStartMinute ?? null,
      quietHoursEndMinute: rule.quietHoursEndMinute ?? null,
      notificationTopicCode: rule.notificationTopicCode ?? null,
    },
  });
  const signature = signPayload(timestamp, body, secret);
  const url = `${baseUrl.replace(/\/$/, '')}/api/integrator/reminders/rules`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-bersoncare-timestamp': timestamp,
      'x-bersoncare-signature': signature,
      ...getCurrentCorrelationIdHeader(),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`integrator reminders/rules ${res.status}: ${text.slice(0, 200)}`);
  }
}
