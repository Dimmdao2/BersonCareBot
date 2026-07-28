'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireDoctorWorkspaceContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  PATIENT_REPEAT_COOLDOWN_MINUTES_MAX,
  PATIENT_REPEAT_COOLDOWN_MINUTES_MIN,
} from '@/modules/patient-home/patientHomeRepeatCooldownSettings';
import {
  isValidPatientHomeDailyWarmupRotationTimesPayload,
  normalizeDailyWarmupRotationTime,
} from '@/modules/patient-home/patientHomeDailyWarmupRotationSettings';

function revalidatePatientHomePages(): void {
  revalidatePath('/app/doctor/patient-home');
  revalidatePath('/app/settings/patient-home');
  revalidatePath('/app/patient');
}

/**
 * P0.11.3: these actions write PER-ORG keys (`patient_home_daily_practice_target`,
 * `patient_home_*_repeat_cooldown_minutes`, `patient_home_mood_icons` — see `orgScopedKeys.ts`), so the
 * caller's own clinic `organizationId` must be resolved here (server actions have no route-level
 * workspace gate). No active membership → `forbidden`, matching this file's existing throw-on-denial style.
 */
async function requireDoctorWorkspaceOrThrow(): Promise<{
  userId: string;
  organizationId: string;
}> {
  const workspace = await requireDoctorWorkspaceContext();
  return { userId: workspace.session.user.userId, organizationId: workspace.organizationId };
}

async function requirePatientHomeOwnerOrThrow(): Promise<{
  userId: string;
  organizationId: string;
}> {
  const workspace = await requireDoctorWorkspaceContext();
  if (workspace.membershipRole !== 'owner') {
    throw new Error('forbidden');
  }
  return { userId: workspace.session.user.userId, organizationId: workspace.organizationId };
}

const moodRowSchema = z.object({
  score: z.number().int().min(1).max(5),
  label: z.string().min(1).max(200),
  imageUrl: z.union([
    z.null(),
    z
      .string()
      .min(1)
      .regex(/^\/api\/media\//),
  ]),
});

export async function savePatientHomePracticeTargetAction(
  target: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { userId, organizationId } = await requirePatientHomeOwnerOrThrow();
    if (!Number.isFinite(target) || target < 1 || target > 10) {
      return { ok: false, error: 'invalid_range' };
    }
    const deps = buildAppDeps();
    await withDoctorWorkspacePrincipal({ organizationId }, () =>
      deps.systemSettings.updateSetting(
        'patient_home_daily_practice_target',
        'admin',
        { value: target },
        userId,
        { organizationId },
      ),
    );
    revalidatePatientHomePages();
    return { ok: true };
  } catch {
    return { ok: false, error: 'forbidden' };
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
});

/** Specialist workspace setting: паузы повтора разминки / пунктов плана. */
export async function savePatientHomeRepeatCooldownsAction(
  input: z.infer<typeof patientHomeRepeatCooldownsSaveSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { userId, organizationId } = await requireDoctorWorkspaceOrThrow();
    const parsed = patientHomeRepeatCooldownsSaveSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: 'invalid_body' };
    }
    const { warmupRepeatMinutes, planItemRepeatMinutes } = parsed.data;
    const deps = buildAppDeps();
    await withDoctorWorkspacePrincipal({ organizationId }, () =>
      Promise.all([
        deps.systemSettings.updateSetting(
          'patient_home_daily_warmup_repeat_cooldown_minutes',
          'admin',
          { value: warmupRepeatMinutes },
          userId,
          { organizationId },
        ),
        deps.systemSettings.updateSetting(
          'patient_treatment_plan_item_done_repeat_cooldown_minutes',
          'admin',
          { value: planItemRepeatMinutes },
          userId,
          { organizationId },
        ),
      ]),
    );
    revalidatePatientHomePages();
    return { ok: true };
  } catch {
    return { ok: false, error: 'forbidden' };
  }
}

export async function savePatientHomeWarmupRotationAction(input: {
  enabled: boolean;
  times: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { userId, organizationId } = await requirePatientHomeOwnerOrThrow();
    if (
      typeof input.enabled !== 'boolean' ||
      !isValidPatientHomeDailyWarmupRotationTimesPayload(input.times)
    ) {
      return { ok: false, error: 'invalid_body' };
    }
    const times = input.times
      .map(normalizeDailyWarmupRotationTime)
      .filter((value): value is string => value !== null)
      .sort();
    const deps = buildAppDeps();
    await withDoctorWorkspacePrincipal({ organizationId }, () =>
      Promise.all([
        deps.systemSettings.updateSetting(
          'patient_home_daily_warmup_rotation_enabled',
          'admin',
          { value: input.enabled },
          userId,
          { organizationId },
        ),
        deps.systemSettings.updateSetting(
          'patient_home_daily_warmup_rotation_times',
          'admin',
          { value: times },
          userId,
          { organizationId },
        ),
      ]),
    );
    revalidatePatientHomePages();
    return { ok: true };
  } catch {
    return { ok: false, error: 'forbidden' };
  }
}

export async function savePatientHomeMoodIconsAction(
  rows: Array<{ score: number; label: string; imageUrl: string | null }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { userId, organizationId } = await requireDoctorWorkspaceOrThrow();
    const parsed = z.array(moodRowSchema).length(5).safeParse(rows);
    if (!parsed.success) {
      return { ok: false, error: 'invalid_body' };
    }
    const scores = new Set(parsed.data.map((r) => r.score));
    if (scores.size !== 5) {
      return { ok: false, error: 'invalid_scores' };
    }
    const sorted = [...parsed.data].sort((a, b) => a.score - b.score);
    const deps = buildAppDeps();
    await withDoctorWorkspacePrincipal({ organizationId }, () =>
      deps.systemSettings.updateSetting(
        'patient_home_mood_icons',
        'admin',
        { value: sorted },
        userId,
        {
          organizationId,
        },
      ),
    );
    revalidatePatientHomePages();
    return { ok: true };
  } catch {
    return { ok: false, error: 'forbidden' };
  }
}
