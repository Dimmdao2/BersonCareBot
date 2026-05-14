"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { canAccessDoctor } from "@/modules/roles/service";
import {
  PATIENT_REPEAT_COOLDOWN_MINUTES_MAX,
  PATIENT_REPEAT_COOLDOWN_MINUTES_MIN,
} from "@/modules/patient-home/patientHomeRepeatCooldownSettings";

function revalidatePatientHomePages(): void {
  revalidatePath("/app/doctor/patient-home");
  revalidatePath("/app/settings/patient-home");
  revalidatePath("/app/patient");
}

async function requireDoctorOrThrow(): Promise<{ userId: string }> {
  const session = await getCurrentSession();
  if (!session || !canAccessDoctor(session.user.role)) {
    throw new Error("forbidden");
  }
  return { userId: session.user.userId };
}

async function requireAdminOrThrow(): Promise<{ userId: string }> {
  const session = await getCurrentSession();
  if (!session || session.user.role !== "admin") {
    throw new Error("forbidden");
  }
  return { userId: session.user.userId };
}

const moodRowSchema = z.object({
  score: z.number().int().min(1).max(5),
  label: z.string().min(1).max(200),
  imageUrl: z.union([z.null(), z.string().min(1).regex(/^\/api\/media\//)]),
});

export async function savePatientHomePracticeTargetAction(target: number): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { userId } = await requireDoctorOrThrow();
    if (!Number.isFinite(target) || target < 1 || target > 10) {
      return { ok: false, error: "invalid_range" };
    }
    const deps = buildAppDeps();
    await deps.systemSettings.updateSetting(
      "patient_home_daily_practice_target",
      "admin",
      { value: target },
      userId,
    );
    revalidatePatientHomePages();
    return { ok: true };
  } catch {
    return { ok: false, error: "forbidden" };
  }
}

const patientHomeRepeatCooldownsSaveSchema = z.object({
  warmupRepeatMinutes: z
    .number()
    .int()
    .min(PATIENT_REPEAT_COOLDOWN_MINUTES_MIN)
    .max(PATIENT_REPEAT_COOLDOWN_MINUTES_MAX),
  planItemRepeatMinutes: z
    .number()
    .int()
    .min(PATIENT_REPEAT_COOLDOWN_MINUTES_MIN)
    .max(PATIENT_REPEAT_COOLDOWN_MINUTES_MAX),
  skipWarmupToNextAvailable: z.boolean(),
});

/** Только admin: паузы повтора разминки / пунктов плана + флаг skip (как UI на `/app/doctor/patient-home`). */
export async function savePatientHomeRepeatCooldownsAction(
  input: z.infer<typeof patientHomeRepeatCooldownsSaveSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { userId } = await requireAdminOrThrow();
    const parsed = patientHomeRepeatCooldownsSaveSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "invalid_body" };
    }
    const { warmupRepeatMinutes, planItemRepeatMinutes, skipWarmupToNextAvailable } = parsed.data;
    const deps = buildAppDeps();
    await Promise.all([
      deps.systemSettings.updateSetting(
        "patient_home_daily_warmup_repeat_cooldown_minutes",
        "admin",
        { value: warmupRepeatMinutes },
        userId,
      ),
      deps.systemSettings.updateSetting(
        "patient_treatment_plan_item_done_repeat_cooldown_minutes",
        "admin",
        { value: planItemRepeatMinutes },
        userId,
      ),
      deps.systemSettings.updateSetting(
        "patient_home_warmup_skip_to_next_available_enabled",
        "admin",
        { value: skipWarmupToNextAvailable },
        userId,
      ),
    ]);
    revalidatePatientHomePages();
    return { ok: true };
  } catch {
    return { ok: false, error: "forbidden" };
  }
}

export async function savePatientHomeMoodIconsAction(
  rows: Array<{ score: number; label: string; imageUrl: string | null }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { userId } = await requireDoctorOrThrow();
    const parsed = z.array(moodRowSchema).length(5).safeParse(rows);
    if (!parsed.success) {
      return { ok: false, error: "invalid_body" };
    }
    const scores = new Set(parsed.data.map((r) => r.score));
    if (scores.size !== 5) {
      return { ok: false, error: "invalid_scores" };
    }
    const sorted = [...parsed.data].sort((a, b) => a.score - b.score);
    const deps = buildAppDeps();
    await deps.systemSettings.updateSetting("patient_home_mood_icons", "admin", { value: sorted }, userId);
    revalidatePatientHomePages();
    return { ok: true };
  } catch {
    return { ok: false, error: "forbidden" };
  }
}
