"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { canAccessDoctor } from "@/modules/roles/service";

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
