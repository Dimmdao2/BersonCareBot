import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger } from "@/app-layer/logging/logger";
import { recordOperatorCronJobTickBestEffort } from "@/app-layer/operator-health/recordOperatorCronJobTick";
import { dispatchDueSpecialistTaskReminders } from "@/modules/specialist-tasks/dispatchDueReminders";
import { loadSpecialistTaskReminderChannelsFromSettings } from "@/modules/specialist-tasks/notifySpecialistTaskReminder";
import {
  OPERATOR_SPECIALIST_TASKS_JOB_FAMILY,
  OPERATOR_SPECIALIST_TASK_REMINDERS_TICK_JOB_KEY,
} from "@/modules/operator-health/reconcileJobKeys";

function bearerMatchesSecret(token: string, secret: string): boolean {
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST — доставка напоминаний по задачам специалиста (remind_at, идемпотентность reminder_sent_at).
 * Secured with `Authorization: Bearer <INTERNAL_JOB_SECRET>`.
 */
export async function POST(request: Request) {
  const secret = env.INTERNAL_JOB_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || !bearerMatchesSecret(token, secret)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));

  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  const deps = buildAppDeps();

  try {
    const result = await dispatchDueSpecialistTaskReminders(
      {
        specialistTasks: deps.specialistTasks,
        getDoctorSetting: (key) =>
          deps.systemSettings.getSetting(
            key as "doctor_specialist_task_reminder_channels",
            "doctor",
          ),
        getReminderChannels: () =>
          loadSpecialistTaskReminderChannelsFromSettings((key) =>
            deps.systemSettings.getSetting(
              key as "doctor_specialist_task_reminder_channels",
              "doctor",
            ),
          ),
        getChannelBindings: deps.loadPlatformUserChannelBindings,
        getProfileEmail: async (platformUserId) => {
          const fields = await deps.userProjection.getProfileEmailFields(platformUserId);
          return fields?.email?.trim() || null;
        },
        webPushSubscriptions: deps.webPushSubscriptions,
        systemSettings: deps.systemSettings,
        resolvePatientDisplayName: async (patientUserId) => {
          const identity = await deps.doctorClientsPort.getClientIdentity(patientUserId);
          return identity?.displayName?.trim() || null;
        },
      },
      { limit },
    );

    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_SPECIALIST_TASKS_JOB_FAMILY,
      jobKey: OPERATOR_SPECIALIST_TASK_REMINDERS_TICK_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: true,
      metaJson: result,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordOperatorCronJobTickBestEffort({
      jobFamily: OPERATOR_SPECIALIST_TASKS_JOB_FAMILY,
      jobKey: OPERATOR_SPECIALIST_TASK_REMINDERS_TICK_JOB_KEY,
      startedAtIso,
      durationMs: Date.now() - startedAt,
      success: false,
      error: msg,
    });
    logger.error({ err: e }, "[internal/specialist-task-reminders/tick] failed");
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
