/**
 * GET/PATCH /api/doctor/clients/:userId/warmup-schedule
 * Returns and updates the patient's warmup reminder schedule.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { isWarmupsContentSectionReminderRule } from "@/modules/reminders/warmupsReminderRuleMatch";
import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";
import { DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS } from "@/modules/reminders/scheduleSlots";

const patchSchema = z.object({
  timesLocal: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1).max(10),
  dayFilter: z.enum(["weekdays", "weekly_mask", "every_n_days"]).optional(),
  /** Required when dayFilter === 'weekly_mask' */
  daysMask: z.string().regex(/^[01]{7}$/).optional(),
  /** Required when dayFilter === 'every_n_days' */
  everyNDays: z.number().int().min(1).optional(),
  anchorDate: z.string().optional(),
});

export async function GET(
  _req: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const rules = await deps.reminders.listRulesByUser(userId);
  const warmupRule = rules.find((r) =>
    isWarmupsContentSectionReminderRule(r, DEFAULT_WARMUPS_SECTION_SLUG),
  );

  return NextResponse.json({
    ok: true,
    rule: warmupRule
      ? {
          id: warmupRule.id,
          scheduleType: warmupRule.scheduleType,
          // Return full scheduleData so panel can round-trip any dayFilter variant
          scheduleData: warmupRule.scheduleData
            ? {
                timesLocal: warmupRule.scheduleData.timesLocal,
                dayFilter: warmupRule.scheduleData.dayFilter ?? "weekdays",
                ...(warmupRule.scheduleData.daysMask
                  ? { daysMask: warmupRule.scheduleData.daysMask }
                  : {}),
                ...(warmupRule.scheduleData.everyNDays
                  ? { everyNDays: warmupRule.scheduleData.everyNDays }
                  : {}),
                ...(warmupRule.scheduleData.anchorDate
                  ? { anchorDate: warmupRule.scheduleData.anchorDate }
                  : {}),
              }
            : null,
          enabled: warmupRule.enabled,
        }
      : null,
  });
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  }

  const raw = (await req.json().catch(() => null)) as unknown;
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const rules = await deps.reminders.listRulesByUser(userId);
  const warmupRule = rules.find((r) =>
    isWarmupsContentSectionReminderRule(r, DEFAULT_WARMUPS_SECTION_SLUG),
  );

  if (!warmupRule) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // Merge incoming fields over the existing scheduleData (or onboarding defaults for pre-slots_v1 rules).
  // Pass full parsed.data so daysMask/everyNDays/anchorDate are preserved when the panel sends them,
  // and the existing rule's own values are not silently overwritten.
  const existingBase = warmupRule.scheduleData ?? DEFAULT_WARMUP_PWA_PUSH_ONBOARDING_SLOTS;
  const scheduleData = {
    ...existingBase,
    ...parsed.data,
    dayFilter: parsed.data.dayFilter ?? existingBase.dayFilter,
  };

  const result = await deps.reminders.updateRule(userId, warmupRule.id, {
    schedule: {
      scheduleType: "slots_v1",
      intervalMinutes: warmupRule.intervalMinutes ?? 60,
      windowStartMinute: warmupRule.windowStartMinute,
      windowEndMinute: warmupRule.windowEndMinute,
      daysMask: warmupRule.daysMask,
      scheduleData,
      quietHoursStartMinute: warmupRule.quietHoursStartMinute,
      quietHoursEndMinute: warmupRule.quietHoursEndMinute,
    },
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
