import type { ReminderJournalPort } from "./reminderJournalPort";
import type { ReminderRulesPort } from "./ports";
import type { ReminderCategory, ReminderLinkedObjectType, ReminderRule, ReminderUpdateSchedule } from "./types";

export type { ReminderCategory, ReminderRule } from "./types";

// ──────────────────────────────────────────────────────────────────────────────
// Legacy dispatch validator (used by integrator webhook route)
// ──────────────────────────────────────────────────────────────────────────────

export type ReminderDispatchRequest = {
  idempotencyKey: string;
  userId: string;
  message: {
    title: string;
    body: string;
  };
};

export function validateReminderDispatchPayload(value: unknown): value is ReminderDispatchRequest {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Record<string, unknown>;
  const message = payload.message as Record<string, unknown> | undefined;

  return (
    typeof payload.idempotencyKey === "string" &&
    typeof payload.userId === "string" &&
    typeof message?.title === "string" &&
    typeof message?.body === "string"
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Reminders service
// ──────────────────────────────────────────────────────────────────────────────

export type UpdateRuleData = Partial<ReminderUpdateSchedule> & {
  enabled?: boolean;
  customTitle?: string | null;
  customText?: string | null;
};

/** Показываем пользователю, если БД обновлена, а relay к integrator не удался (D.3). */
export const REMINDER_INTEGRATOR_SYNC_WARNING =
  "Настройки сохранены локально, но синхронизация с ботом не удалась.";

type ServiceResult<T> =
  | { ok: true; data: T; syncWarning?: string }
  | { ok: false; error: string };

export type RemindersServiceDeps = {
  notifyIntegrator?: (rule: ReminderRule) => Promise<void>;
  journal?: ReminderJournalPort;
};

function validateSchedule(s: ReminderUpdateSchedule): string | null {
  if (s.windowStartMinute < 0 || s.windowStartMinute > 1439) return "validation_error: windowStartMinute";
  if (s.windowEndMinute < 1 || s.windowEndMinute > 1440) return "validation_error: windowEndMinute";
  if (s.windowStartMinute >= s.windowEndMinute) return "invalid_window";
  if (s.intervalMinutes < 1 || s.intervalMinutes > 1440) return "invalid_interval";
  if (!/^[01]{7}$/.test(s.daysMask)) return "validation_error: daysMask";
  return null;
}

function validateLinkedFields(
  linkedObjectType: ReminderLinkedObjectType,
  linkedObjectId: string | null,
  customTitle: string | null,
  customText: string | null,
): string | null {
  if (linkedObjectType === "custom") {
    if (!customTitle?.trim()) return "validation_error: customTitle required for custom";
    if (linkedObjectId != null && linkedObjectId.trim() !== "")
      return "validation_error: linkedObjectId must be null for custom";
    return null;
  }
  if (!linkedObjectId?.trim()) return "validation_error: linkedObjectId required";
  if (customTitle != null || customText != null)
    return "validation_error: customTitle/customText only for custom type";
  return null;
}

async function reloadRule(port: ReminderRulesPort, platformUserId: string, ruleId: string) {
  const rules = await port.listByPlatformUserWithObjects(platformUserId);
  return rules.find((r) => r.id === ruleId) ?? null;
}

export function createRemindersService(port: ReminderRulesPort, deps?: RemindersServiceDeps) {
  /** true = синхронизация ок или не настроена; false = relay пытались, но ошибка. */
  async function tryNotifyIntegrator(rule: ReminderRule): Promise<boolean> {
    if (!deps?.notifyIntegrator) return true;
    try {
      await deps.notifyIntegrator(rule);
      return true;
    } catch (err) {
      console.warn("[reminders] integrator notify failed:", err);
      return false;
    }
  }

  return {
    async listRulesByUser(platformUserId: string): Promise<ReminderRule[]> {
      return port.listByPlatformUser(platformUserId);
    },

    async toggleCategory(
      platformUserId: string,
      category: ReminderCategory,
      enabled: boolean,
    ): Promise<ServiceResult<ReminderRule>> {
      const rule = await port.getByPlatformUserAndCategory(platformUserId, category);
      if (!rule) return { ok: false, error: "not_found" };
      await port.updateEnabled(rule.id, enabled);
      const updated: ReminderRule = { ...rule, enabled };
      const syncOk = await tryNotifyIntegrator(updated);
      return {
        ok: true,
        data: updated,
        ...(syncOk ? {} : { syncWarning: REMINDER_INTEGRATOR_SYNC_WARNING }),
      };
    },

    async updateRule(
      platformUserId: string,
      ruleId: string,
      data: UpdateRuleData,
    ): Promise<ServiceResult<ReminderRule>> {
      const rules = await port.listByPlatformUserWithObjects(platformUserId);
      const target = rules.find((r) => r.id === ruleId);
      if (!target) return { ok: false, error: "not_found" };

      const newWindow = {
        windowStartMinute: data.windowStartMinute ?? target.windowStartMinute,
        windowEndMinute: data.windowEndMinute ?? target.windowEndMinute,
      };
      if (newWindow.windowStartMinute >= newWindow.windowEndMinute) {
        return { ok: false, error: "invalid_window: windowStart must be < windowEnd" };
      }
      if (data.intervalMinutes !== undefined && data.intervalMinutes <= 0) {
        return { ok: false, error: "invalid_interval: intervalMinutes must be > 0" };
      }

      if (data.customTitle !== undefined || data.customText !== undefined) {
        if (target.linkedObjectType !== "custom") {
          return { ok: false, error: "validation_error: custom fields only for custom reminders" };
        }
        const title = data.customTitle !== undefined ? data.customTitle : target.customTitle;
        const text = data.customText !== undefined ? data.customText : target.customText;
        if (title !== null && title !== undefined && !String(title).trim()) {
          return { ok: false, error: "validation_error: customTitle cannot be empty" };
        }
        await port.updateCustomTexts(
          ruleId,
          title ?? null,
          text ?? null,
        );
      }

      if (data.enabled !== undefined) {
        await port.updateEnabled(ruleId, data.enabled);
      }

      const hasScheduleChange =
        data.intervalMinutes !== undefined ||
        data.windowStartMinute !== undefined ||
        data.windowEndMinute !== undefined ||
        data.daysMask !== undefined;

      if (hasScheduleChange) {
        await port.updateSchedule(ruleId, {
          intervalMinutes: data.intervalMinutes ?? target.intervalMinutes ?? 60,
          windowStartMinute: data.windowStartMinute ?? target.windowStartMinute,
          windowEndMinute: data.windowEndMinute ?? target.windowEndMinute,
          daysMask: data.daysMask ?? target.daysMask,
        });
      }

      const refreshed = await reloadRule(port, platformUserId, ruleId);
      if (!refreshed) return { ok: false, error: "not_found" };

      const syncOk = await tryNotifyIntegrator(refreshed);
      return {
        ok: true,
        data: refreshed,
        ...(syncOk ? {} : { syncWarning: REMINDER_INTEGRATOR_SYNC_WARNING }),
      };
    },

    async createObjectReminder(
      platformUserId: string,
      params: {
        linkedObjectType: Exclude<ReminderLinkedObjectType, "custom">;
        linkedObjectId: string;
        schedule: ReminderUpdateSchedule;
        enabled?: boolean;
      },
    ): Promise<ServiceResult<ReminderRule>> {
      const err = validateLinkedFields(
        params.linkedObjectType,
        params.linkedObjectId,
        null,
        null,
      );
      if (err) return { ok: false, error: err };

      const schedErr = validateSchedule(params.schedule);
      if (schedErr) return { ok: false, error: schedErr };

      const integratorUserId = await port.resolveIntegratorUserId(platformUserId);
      if (!integratorUserId) return { ok: false, error: "not_found" };

      const rule = await port.create({
        platformUserId,
        integratorUserId,
        linkedObjectType: params.linkedObjectType,
        linkedObjectId: params.linkedObjectId.trim(),
        customTitle: null,
        customText: null,
        enabled: params.enabled ?? true,
        schedule: params.schedule,
      });
      const syncOk = await tryNotifyIntegrator(rule);
      return {
        ok: true,
        data: rule,
        ...(syncOk ? {} : { syncWarning: REMINDER_INTEGRATOR_SYNC_WARNING }),
      };
    },

    async createCustomReminder(
      platformUserId: string,
      params: {
        customTitle: string;
        customText?: string | null;
        schedule: ReminderUpdateSchedule;
        enabled?: boolean;
      },
    ): Promise<ServiceResult<ReminderRule>> {
      const err = validateLinkedFields("custom", null, params.customTitle, params.customText ?? null);
      if (err) return { ok: false, error: err };

      const schedErr = validateSchedule(params.schedule);
      if (schedErr) return { ok: false, error: schedErr };

      const integratorUserId = await port.resolveIntegratorUserId(platformUserId);
      if (!integratorUserId) return { ok: false, error: "not_found" };

      const rule = await port.create({
        platformUserId,
        integratorUserId,
        linkedObjectType: "custom",
        linkedObjectId: null,
        customTitle: params.customTitle.trim(),
        customText: params.customText?.trim() ? params.customText.trim() : null,
        enabled: params.enabled ?? true,
        schedule: params.schedule,
      });
      const syncOk = await tryNotifyIntegrator(rule);
      return {
        ok: true,
        data: rule,
        ...(syncOk ? {} : { syncWarning: REMINDER_INTEGRATOR_SYNC_WARNING }),
      };
    },

    async retargetContentPageLinkedSlug(
      contentPageId: string,
      oldSlug: string,
      newSlug: string,
    ): Promise<void> {
      await port.retargetContentPageLinkedSlug(contentPageId, oldSlug, newSlug);
    },

    async deleteReminder(platformUserId: string, ruleId: string): Promise<ServiceResult<{ deletedId: string }>> {
      const deleted = await port.delete(ruleId, platformUserId);
      if (!deleted) return { ok: false, error: "not_found" };
      return { ok: true, data: { deletedId: ruleId } };
    },

    async snoozeOccurrence(
      platformUserId: string,
      integratorOccurrenceId: string,
      minutes: 30 | 60 | 120,
    ): Promise<ServiceResult<{ occurrenceId: string; snoozedUntil: string }>> {
      if (!deps?.journal) return { ok: false, error: "not_available" };
      const res = await deps.journal.recordSnooze(platformUserId, integratorOccurrenceId, minutes);
      if (!res.ok) return { ok: false, error: "not_found" };
      return { ok: true, data: { occurrenceId: res.occurrenceId, snoozedUntil: res.snoozedUntil } };
    },

    async skipOccurrence(
      platformUserId: string,
      integratorOccurrenceId: string,
      reason: string | null,
    ): Promise<ServiceResult<{ occurrenceId: string; skippedAt: string }>> {
      if (!deps?.journal) return { ok: false, error: "not_available" };
      const res = await deps.journal.recordSkip(platformUserId, integratorOccurrenceId, reason);
      if (!res.ok) return { ok: false, error: "not_found" };
      return { ok: true, data: { occurrenceId: res.occurrenceId, skippedAt: res.skippedAt } };
    },
  };
}

export type RemindersService = ReturnType<typeof createRemindersService>;
