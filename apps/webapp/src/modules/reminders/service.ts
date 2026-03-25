import type { ReminderRulesPort } from "./ports";
import type { ReminderCategory, ReminderRule, ReminderUpdateSchedule } from "./types";

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

export type UpdateRuleData = Partial<ReminderUpdateSchedule> & { enabled?: boolean };

/** Показываем пользователю, если БД обновлена, а relay к integrator не удался (D.3). */
export const REMINDER_INTEGRATOR_SYNC_WARNING =
  "Настройки сохранены локально, но синхронизация с ботом не удалась.";

type ServiceResult<T> =
  | { ok: true; data: T; syncWarning?: string }
  | { ok: false; error: string };

export type RemindersServiceDeps = {
  notifyIntegrator?: (rule: ReminderRule) => Promise<void>;
};

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
      // Lookup by ruleId (integrator_rule_id) through the user's rule list
      const rules = await port.listByPlatformUser(platformUserId);
      const target = rules.find((r) => r.id === ruleId);
      if (!target) return { ok: false, error: "not_found" };

      // Validate bounds
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

      const updated: ReminderRule = {
        ...target,
        enabled: data.enabled ?? target.enabled,
        intervalMinutes: data.intervalMinutes ?? target.intervalMinutes,
        windowStartMinute: data.windowStartMinute ?? target.windowStartMinute,
        windowEndMinute: data.windowEndMinute ?? target.windowEndMinute,
        daysMask: data.daysMask ?? target.daysMask,
      };
      const syncOk = await tryNotifyIntegrator(updated);
      return {
        ok: true,
        data: updated,
        ...(syncOk ? {} : { syncWarning: REMINDER_INTEGRATOR_SYNC_WARNING }),
      };
    },
  };
}

export type RemindersService = ReturnType<typeof createRemindersService>;
