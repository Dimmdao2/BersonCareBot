import type { ReminderJournalPort } from "./reminderJournalPort";
import type { ReminderRulesPort } from "./ports";
import type {
  ReminderCategory,
  ReminderLinkedObjectType,
  ReminderRule,
  ReminderUpdateSchedule,
} from "./types";
import type { SlotsV1ScheduleData } from "./scheduleSlots";
import {
  DEFAULT_REHAB_WEEKDAY_SLOTS,
  SLOTS_V1_DB_PLACEHOLDER,
  normalizeSlotsV1ScheduleData,
} from "./scheduleSlots";
import { validateQuietHoursPair } from "./quietHours";
import {
  REMINDER_INTERVAL_WINDOW_MAX_MINUTES,
  REMINDER_INTERVAL_WINDOW_MIN_MINUTES,
} from "./reminderIntervalBounds";

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
  /** Full schedule + quiet replacement (preferred). */
  schedule?: {
    scheduleType: "interval_window" | "slots_v1";
    intervalMinutes: number;
    windowStartMinute: number;
    windowEndMinute: number;
    daysMask: string;
    scheduleData?: SlotsV1ScheduleData | null;
    quietHoursStartMinute?: number | null;
    quietHoursEndMinute?: number | null;
  };
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
  if (
    s.intervalMinutes < REMINDER_INTERVAL_WINDOW_MIN_MINUTES ||
    s.intervalMinutes > REMINDER_INTERVAL_WINDOW_MAX_MINUTES
  ) {
    return "invalid_interval";
  }
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

function validateSnoozeMinutes(minutes: number): string | null {
  const m = Math.trunc(minutes);
  if (!Number.isFinite(minutes) || m !== minutes) return "validation_error: minutes";
  if (m < 1 || m > 720) return "validation_error: minutes range";
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

      const hasPartialScheduleChange =
        data.intervalMinutes !== undefined ||
        data.windowStartMinute !== undefined ||
        data.windowEndMinute !== undefined ||
        data.daysMask !== undefined;

      if (data.schedule) {
        const qErr = validateQuietHoursPair(
          data.schedule.quietHoursStartMinute,
          data.schedule.quietHoursEndMinute,
        );
        if (qErr) return { ok: false, error: qErr };

        if (data.schedule.scheduleType === "slots_v1") {
          const raw = data.schedule.scheduleData;
          if (!raw) return { ok: false, error: "validation_error: scheduleData" };
          const norm = normalizeSlotsV1ScheduleData(raw);
          if (!norm.ok) return { ok: false, error: norm.error };
          await port.updateScheduleAndType(ruleId, {
            scheduleType: "slots_v1",
            intervalMinutes: SLOTS_V1_DB_PLACEHOLDER.intervalMinutes,
            windowStartMinute: SLOTS_V1_DB_PLACEHOLDER.windowStartMinute,
            windowEndMinute: SLOTS_V1_DB_PLACEHOLDER.windowEndMinute,
            daysMask: data.schedule.daysMask,
            scheduleData: norm.data as unknown as Record<string, unknown>,
            quietHoursStartMinute: data.schedule.quietHoursStartMinute ?? null,
            quietHoursEndMinute: data.schedule.quietHoursEndMinute ?? null,
          });
        } else {
          const sched: ReminderUpdateSchedule = {
            intervalMinutes: data.schedule.intervalMinutes,
            windowStartMinute: data.schedule.windowStartMinute,
            windowEndMinute: data.schedule.windowEndMinute,
            daysMask: data.schedule.daysMask,
          };
          const err = validateSchedule(sched);
          if (err) return { ok: false, error: err };
          await port.updateScheduleAndType(ruleId, {
            scheduleType: "interval_window",
            intervalMinutes: sched.intervalMinutes,
            windowStartMinute: sched.windowStartMinute,
            windowEndMinute: sched.windowEndMinute,
            daysMask: sched.daysMask,
            scheduleData: null,
            quietHoursStartMinute: data.schedule.quietHoursStartMinute ?? null,
            quietHoursEndMinute: data.schedule.quietHoursEndMinute ?? null,
          });
        }
      } else if (hasPartialScheduleChange) {
        if (target.scheduleType === "slots_v1") {
          const daysMask = data.daysMask ?? target.daysMask;
          if (!/^[01]{7}$/.test(daysMask)) return { ok: false, error: "validation_error: daysMask" };
          const baseData = target.scheduleData ?? DEFAULT_REHAB_WEEKDAY_SLOTS;
          const norm = normalizeSlotsV1ScheduleData(baseData);
          if (!norm.ok) return { ok: false, error: norm.error };
          await port.updateScheduleAndType(ruleId, {
            scheduleType: "slots_v1",
            intervalMinutes: SLOTS_V1_DB_PLACEHOLDER.intervalMinutes,
            windowStartMinute: SLOTS_V1_DB_PLACEHOLDER.windowStartMinute,
            windowEndMinute: SLOTS_V1_DB_PLACEHOLDER.windowEndMinute,
            daysMask,
            scheduleData: norm.data as unknown as Record<string, unknown>,
            quietHoursStartMinute: target.quietHoursStartMinute ?? null,
            quietHoursEndMinute: target.quietHoursEndMinute ?? null,
          });
        } else {
          const merged: ReminderUpdateSchedule = {
            intervalMinutes: data.intervalMinutes ?? target.intervalMinutes ?? 60,
            windowStartMinute: data.windowStartMinute ?? target.windowStartMinute,
            windowEndMinute: data.windowEndMinute ?? target.windowEndMinute,
            daysMask: data.daysMask ?? target.daysMask,
          };
          const err = validateSchedule(merged);
          if (err) return { ok: false, error: err };
          await port.updateScheduleAndType(ruleId, {
            scheduleType: "interval_window",
            intervalMinutes: merged.intervalMinutes,
            windowStartMinute: merged.windowStartMinute,
            windowEndMinute: merged.windowEndMinute,
            daysMask: merged.daysMask,
            scheduleData: null,
            quietHoursStartMinute: target.quietHoursStartMinute ?? null,
            quietHoursEndMinute: target.quietHoursEndMinute ?? null,
          });
        }
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
        scheduleType?: "interval_window" | "slots_v1";
        scheduleData?: SlotsV1ScheduleData | null;
        quietHoursStartMinute?: number | null;
        quietHoursEndMinute?: number | null;
      },
    ): Promise<ServiceResult<ReminderRule>> {
      const err = validateLinkedFields(
        params.linkedObjectType,
        params.linkedObjectId,
        null,
        null,
      );
      if (err) return { ok: false, error: err };

      const scheduleType = params.scheduleType ?? "interval_window";
      const qErr = validateQuietHoursPair(params.quietHoursStartMinute, params.quietHoursEndMinute);
      if (qErr) return { ok: false, error: qErr };

      const integratorUserId = await port.resolveIntegratorUserId(platformUserId);
      if (!integratorUserId) return { ok: false, error: "not_found" };

      if (scheduleType === "slots_v1") {
        let sdInput: SlotsV1ScheduleData | null | undefined = params.scheduleData ?? null;
        if (!sdInput && params.linkedObjectType === "rehab_program") {
          sdInput = DEFAULT_REHAB_WEEKDAY_SLOTS;
        }
        if (!sdInput) return { ok: false, error: "validation_error: scheduleData" };
        const norm = normalizeSlotsV1ScheduleData(sdInput);
        if (!norm.ok) return { ok: false, error: norm.error };

        const rule = await port.create({
          platformUserId,
          integratorUserId,
          linkedObjectType: params.linkedObjectType,
          linkedObjectId: params.linkedObjectId.trim(),
          customTitle: null,
          customText: null,
          enabled: params.enabled ?? true,
          schedule: {
            intervalMinutes: SLOTS_V1_DB_PLACEHOLDER.intervalMinutes,
            windowStartMinute: SLOTS_V1_DB_PLACEHOLDER.windowStartMinute,
            windowEndMinute: SLOTS_V1_DB_PLACEHOLDER.windowEndMinute,
            daysMask: params.schedule.daysMask,
          },
          scheduleType: "slots_v1",
          scheduleData: norm.data,
          quietHoursStartMinute: params.quietHoursStartMinute ?? null,
          quietHoursEndMinute: params.quietHoursEndMinute ?? null,
        });
        const syncOk = await tryNotifyIntegrator(rule);
        return {
          ok: true,
          data: rule,
          ...(syncOk ? {} : { syncWarning: REMINDER_INTEGRATOR_SYNC_WARNING }),
        };
      }

      const schedErr = validateSchedule(params.schedule);
      if (schedErr) return { ok: false, error: schedErr };

      const rule = await port.create({
        platformUserId,
        integratorUserId,
        linkedObjectType: params.linkedObjectType,
        linkedObjectId: params.linkedObjectId.trim(),
        customTitle: null,
        customText: null,
        enabled: params.enabled ?? true,
        schedule: params.schedule,
        scheduleType: "interval_window",
        scheduleData: null,
        quietHoursStartMinute: params.quietHoursStartMinute ?? null,
        quietHoursEndMinute: params.quietHoursEndMinute ?? null,
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
        scheduleType?: "interval_window" | "slots_v1";
        scheduleData?: SlotsV1ScheduleData | null;
        quietHoursStartMinute?: number | null;
        quietHoursEndMinute?: number | null;
      },
    ): Promise<ServiceResult<ReminderRule>> {
      const err = validateLinkedFields("custom", null, params.customTitle, params.customText ?? null);
      if (err) return { ok: false, error: err };

      const scheduleType = params.scheduleType ?? "interval_window";
      const qErr = validateQuietHoursPair(params.quietHoursStartMinute, params.quietHoursEndMinute);
      if (qErr) return { ok: false, error: qErr };

      const integratorUserId = await port.resolveIntegratorUserId(platformUserId);
      if (!integratorUserId) return { ok: false, error: "not_found" };

      if (scheduleType === "slots_v1") {
        if (!params.scheduleData) return { ok: false, error: "validation_error: scheduleData" };
        const norm = normalizeSlotsV1ScheduleData(params.scheduleData);
        if (!norm.ok) return { ok: false, error: norm.error };

        const rule = await port.create({
          platformUserId,
          integratorUserId,
          linkedObjectType: "custom",
          linkedObjectId: null,
          customTitle: params.customTitle.trim(),
          customText: params.customText?.trim() ? params.customText.trim() : null,
          enabled: params.enabled ?? true,
          schedule: {
            intervalMinutes: SLOTS_V1_DB_PLACEHOLDER.intervalMinutes,
            windowStartMinute: SLOTS_V1_DB_PLACEHOLDER.windowStartMinute,
            windowEndMinute: SLOTS_V1_DB_PLACEHOLDER.windowEndMinute,
            daysMask: params.schedule.daysMask,
          },
          scheduleType: "slots_v1",
          scheduleData: norm.data,
          quietHoursStartMinute: params.quietHoursStartMinute ?? null,
          quietHoursEndMinute: params.quietHoursEndMinute ?? null,
        });
        const syncOk = await tryNotifyIntegrator(rule);
        return {
          ok: true,
          data: rule,
          ...(syncOk ? {} : { syncWarning: REMINDER_INTEGRATOR_SYNC_WARNING }),
        };
      }

      const schedErr = validateSchedule(params.schedule);
      if (schedErr) return { ok: false, error: schedErr };

      const rule = await port.create({
        platformUserId,
        integratorUserId,
        linkedObjectType: "custom",
        linkedObjectId: null,
        customTitle: params.customTitle.trim(),
        customText: params.customText?.trim() ? params.customText.trim() : null,
        enabled: params.enabled ?? true,
        schedule: params.schedule,
        scheduleType: "interval_window",
        scheduleData: null,
        quietHoursStartMinute: params.quietHoursStartMinute ?? null,
        quietHoursEndMinute: params.quietHoursEndMinute ?? null,
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
      minutes: number,
    ): Promise<ServiceResult<{ occurrenceId: string; snoozedUntil: string }>> {
      const v = validateSnoozeMinutes(minutes);
      if (v) return { ok: false, error: v };
      if (!deps?.journal) return { ok: false, error: "not_available" };
      const m = Math.trunc(minutes);
      const res = await deps.journal.recordSnooze(platformUserId, integratorOccurrenceId, m);
      if (!res.ok) return { ok: false, error: "not_found" };
      return { ok: true, data: { occurrenceId: res.occurrenceId, snoozedUntil: res.snoozedUntil } };
    },

    async doneOccurrence(
      platformUserId: string,
      integratorOccurrenceId: string,
    ): Promise<ServiceResult<{ occurrenceId: string; doneAt: string }>> {
      if (!deps?.journal) return { ok: false, error: "not_available" };
      const res = await deps.journal.recordDone(platformUserId, integratorOccurrenceId);
      if (!res.ok) {
        if (res.error === "conflict") return { ok: false, error: "conflict" };
        return { ok: false, error: "not_found" };
      }
      return { ok: true, data: { occurrenceId: res.occurrenceId, doneAt: res.doneAt } };
    },

    async skipOccurrence(
      platformUserId: string,
      integratorOccurrenceId: string,
      reason: string | null,
    ): Promise<ServiceResult<{ occurrenceId: string; skippedAt: string }>> {
      if (!deps?.journal) return { ok: false, error: "not_available" };
      const normalizedReason =
        reason === null || reason === undefined
          ? null
          : typeof reason === "string" && reason.trim() === ""
            ? null
            : reason;
      const res = await deps.journal.recordSkip(platformUserId, integratorOccurrenceId, normalizedReason);
      if (!res.ok) return { ok: false, error: "not_found" };
      return { ok: true, data: { occurrenceId: res.occurrenceId, skippedAt: res.skippedAt } };
    },

    async setReminderMutedUntil(platformUserId: string, mutedUntilIso: string | null): Promise<void> {
      await port.setReminderMutedUntil(platformUserId, mutedUntilIso);
    },

    async getReminderMutedUntil(platformUserId: string): Promise<string | null> {
      return port.getReminderMutedUntil(platformUserId);
    },
  };
}

export type RemindersService = ReturnType<typeof createRemindersService>;
