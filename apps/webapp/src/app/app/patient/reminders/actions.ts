"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requirePatientAccessWithPhone } from "@/app-layer/guards/requireRole";
import { routePaths } from "@/app-layer/routes/paths";
import type { ReminderCategory } from "@/modules/reminders/types";

const DAYS_MASK_RE = /^[01]{7}$/;

const toggleSchema = z.object({
  category: z.enum(["appointment", "lfk", "chat", "important", "broadcast"]),
  enabled: z.boolean(),
});

const updateScheduleSchema = z.object({
  ruleId: z.string().min(1),
  intervalMinutes: z.number().int().min(1, "Минимум 1 минута"),
  windowStartMinute: z.number().int().min(0).max(1439),
  windowEndMinute: z.number().int().min(1).max(1440),
  daysMask: z.string().regex(DAYS_MASK_RE, "Неверный формат маски дней"),
});

export type ToggleResult =
  | { ok: true; syncWarning?: string }
  | { ok: false; error: string };
export type UpdateScheduleResult =
  | { ok: true; syncWarning?: string }
  | { ok: false; error: string };

export async function toggleReminderCategory(
  category: ReminderCategory,
  enabled: boolean,
): Promise<ToggleResult> {
  const session = await requirePatientAccessWithPhone(routePaths.patientReminders);
  const parsed = toggleSchema.safeParse({ category, enabled });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const deps = buildAppDeps();
  const result = await deps.reminders.toggleCategory(session.user.userId, category, enabled);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(routePaths.patientReminders);
  return { ok: true, ...(result.syncWarning ? { syncWarning: result.syncWarning } : {}) };
}

export async function updateReminderRule(
  data: z.infer<typeof updateScheduleSchema>,
): Promise<UpdateScheduleResult> {
  const session = await requirePatientAccessWithPhone(routePaths.patientReminders);
  const parsed = updateScheduleSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  if (parsed.data.windowStartMinute >= parsed.data.windowEndMinute) {
    return { ok: false, error: "Начало окна должно быть меньше конца" };
  }

  const deps = buildAppDeps();
  const result = await deps.reminders.updateRule(session.user.userId, parsed.data.ruleId, {
    intervalMinutes: parsed.data.intervalMinutes,
    windowStartMinute: parsed.data.windowStartMinute,
    windowEndMinute: parsed.data.windowEndMinute,
    daysMask: parsed.data.daysMask,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(routePaths.patientReminders);
  return { ok: true, ...(result.syncWarning ? { syncWarning: result.syncWarning } : {}) };
}
