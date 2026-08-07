/**
 * Notification template storage in public.system_settings.
 * Keys: notif_template:<event>:<audience> (scope: admin).
 * Falls back to hardcoded defaults when no DB row exists.
 */
import type { DbPort } from '../../../kernel/contracts/index.js';
import {
  fetchIntegratorRuntimeSettingValueJson,
  type IntegratorRuntimeSettingKey,
  parseSystemSettingStringValue,
} from '../publicSystemSettings.js';
import { interpolateTemplate } from '../../../kernel/orchestrator/templateInterpolation.js';

export type NotifTemplateEvent = 'created' | 'cancelled' | 'rescheduled';
export type NotifTemplateAudience = 'patient' | 'doctor';

/**
 * Variables for notification template interpolation.
 * city: formatted suffix e.g. " (Москва)" or "" (caller pre-formats; includes parens/space when non-empty)
 * reason: formatted suffix e.g. "\nПричина: ..." or "" (caller pre-formats; includes newline when non-empty)
 */
export type NotifTemplateVars = Partial<{
  date: string;
  type: string;
  city: string;
  name: string;
  phone: string;
  reason: string;
}>;

/** Defaults mirror the provider-neutral booking lifecycle notification text. */
export const NOTIF_TEMPLATE_DEFAULTS: Record<
  NotifTemplateEvent,
  Record<NotifTemplateAudience, string>
> = {
  created: {
    patient: 'Запись подтверждена: {{date}}\n{{type}}{{city}}',
    doctor: 'Новая запись: {{name}}, {{phone}}\nДата: {{date}}',
  },
  cancelled: {
    patient: 'Запись на {{date}} отменена.{{reason}}',
    doctor: 'Отмена записи: {{name}}\nДата: {{date}}',
  },
  rescheduled: {
    patient: 'Запись перенесена на {{date}}\n{{type}}',
    doctor: 'Перенос записи: {{name}}, {{phone}}\nНовая дата: {{date}}',
  },
};

export function notifTemplateKey(
  event: NotifTemplateEvent,
  audience: NotifTemplateAudience,
): IntegratorRuntimeSettingKey {
  return `notif_template:${event}:${audience}`;
}

/** Returns the template text from DB or the hardcoded default. Fail-safe: DB errors fall through to default. */
export async function getNotifTemplate(
  event: NotifTemplateEvent,
  audience: NotifTemplateAudience,
  db: DbPort,
): Promise<string> {
  try {
    const key = notifTemplateKey(event, audience);
    const valueJson = await fetchIntegratorRuntimeSettingValueJson(db, key);
    const text = valueJson === null ? null : parseSystemSettingStringValue(valueJson);
    if (text !== null) return text;
  } catch {
    // DB unavailable: fall through to default
  }
  return NOTIF_TEMPLATE_DEFAULTS[event][audience];
}

/** Interpolates {{var}} placeholders in a template string. */
export function renderNotifTemplate(templateText: string, vars: NotifTemplateVars): string {
  const result = interpolateTemplate(templateText, vars as Record<string, unknown>);
  return typeof result === 'string' ? result : templateText;
}
