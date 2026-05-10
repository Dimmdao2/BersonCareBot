import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import type { ReminderLinkedObjectType } from "@/modules/reminders/types";
import type { SlotsV1ScheduleData } from "@/modules/reminders/scheduleSlots";
import { SLOTS_V1_DB_PLACEHOLDER } from "@/modules/reminders/scheduleSlots";
import { reminderRuleToPatientJson } from "../reminderPatientJson";

const LINKED_TYPES = new Set<ReminderLinkedObjectType>([
  "lfk_complex",
  "content_section",
  "content_page",
  "rehab_program",
  "treatment_program_item",
  "custom",
]);

function parseQuietFromSchedule(schedule: Record<string, unknown>):
  | { ok: true; quietHoursStartMinute?: number | null; quietHoursEndMinute?: number | null }
  | { ok: false } {
  const hasS = Object.prototype.hasOwnProperty.call(schedule, "quietHoursStartMinute");
  const hasE = Object.prototype.hasOwnProperty.call(schedule, "quietHoursEndMinute");
  if (!hasS && !hasE) return { ok: true };
  const qs = schedule.quietHoursStartMinute;
  const qe = schedule.quietHoursEndMinute;
  if (qs === null && qe === null) return { ok: true, quietHoursStartMinute: null, quietHoursEndMinute: null };
  if (typeof qs === "number" && Number.isInteger(qs) && typeof qe === "number" && Number.isInteger(qe)) {
    return { ok: true, quietHoursStartMinute: qs, quietHoursEndMinute: qe };
  }
  return { ok: false };
}

export async function POST(req: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientReminders });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const linkedObjectType = body.linkedObjectType;
  const schedule = body.schedule as Record<string, unknown> | undefined;
  if (typeof linkedObjectType !== "string" || !LINKED_TYPES.has(linkedObjectType as ReminderLinkedObjectType)) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }
  if (!schedule || typeof schedule !== "object") {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const scheduleTypeRaw = schedule.scheduleType;
  const scheduleType: "interval_window" | "slots_v1" =
    scheduleTypeRaw === "slots_v1"
      ? "slots_v1"
      : scheduleTypeRaw === "interval_window"
        ? "interval_window"
        : "interval_window";

  const daysMask = schedule.daysMask;
  if (typeof daysMask !== "string" || !/^[01]{7}$/.test(daysMask)) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const quietParsed = parseQuietFromSchedule(schedule);
  if (!quietParsed.ok) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  let sched: {
    intervalMinutes: number;
    windowStartMinute: number;
    windowEndMinute: number;
    daysMask: string;
  };
  let scheduleData: SlotsV1ScheduleData | null | undefined;

  if (scheduleType === "slots_v1") {
    sched = {
      intervalMinutes: SLOTS_V1_DB_PLACEHOLDER.intervalMinutes,
      windowStartMinute: SLOTS_V1_DB_PLACEHOLDER.windowStartMinute,
      windowEndMinute: SLOTS_V1_DB_PLACEHOLDER.windowEndMinute,
      daysMask,
    };
    const sd = schedule.scheduleData;
    if (sd !== undefined && sd !== null && typeof sd !== "object") {
      return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
    }
    scheduleData = sd === undefined || sd === null ? null : (sd as SlotsV1ScheduleData);
  } else {
    const intervalMinutes = schedule.intervalMinutes;
    const windowStartMinute = schedule.windowStartMinute;
    const windowEndMinute = schedule.windowEndMinute;
    if (
      typeof intervalMinutes !== "number" ||
      typeof windowStartMinute !== "number" ||
      typeof windowEndMinute !== "number"
    ) {
      return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
    }
    sched = { intervalMinutes, windowStartMinute, windowEndMinute, daysMask };
    scheduleData = null;
  }

  const enabled = typeof body.enabled === "boolean" ? body.enabled : true;

  const deps = buildAppDeps();
  const userId = session.user.userId;

  if (linkedObjectType === "custom") {
    const customTitle = body.customTitle;
    const customText = body.customText;
    if (typeof customTitle !== "string" || customTitle.trim().length === 0 || customTitle.length > 140) {
      return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
    }
    if (customText != null && typeof customText !== "string") {
      return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
    }
    if (typeof customText === "string" && customText.length > 2000) {
      return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
    }
    const res = await deps.reminders.createCustomReminder(userId, {
      customTitle,
      customText: customText === null || customText === undefined ? null : customText,
      schedule: sched,
      enabled,
      scheduleType,
      scheduleData: scheduleType === "slots_v1" ? scheduleData : null,
      quietHoursStartMinute: quietParsed.quietHoursStartMinute ?? null,
      quietHoursEndMinute: quietParsed.quietHoursEndMinute ?? null,
    });
    if (!res.ok) {
      const status = res.error === "not_found" ? 404 : 400;
      return NextResponse.json({ ok: false, error: res.error }, { status });
    }
    revalidatePath(routePaths.patientReminders);
    revalidatePath(routePaths.patient);
    return NextResponse.json(
      {
        ok: true,
        reminder: reminderRuleToPatientJson(res.data),
        ...(res.syncWarning ? { syncWarning: res.syncWarning } : {}),
      },
      { status: 201 },
    );
  }

  const linkedObjectId = body.linkedObjectId;
  if (typeof linkedObjectId !== "string" || linkedObjectId.trim().length === 0 || linkedObjectId.length > 200) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const res = await deps.reminders.createObjectReminder(userId, {
    linkedObjectType: linkedObjectType as Exclude<ReminderLinkedObjectType, "custom">,
    linkedObjectId,
    schedule: sched,
    enabled,
    scheduleType,
    scheduleData: scheduleType === "slots_v1" ? scheduleData : null,
    quietHoursStartMinute: quietParsed.quietHoursStartMinute ?? null,
    quietHoursEndMinute: quietParsed.quietHoursEndMinute ?? null,
  });
  if (!res.ok) {
    const status = res.error === "not_found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }
  revalidatePath(routePaths.patientReminders);
  revalidatePath(routePaths.patient);
  return NextResponse.json(
    {
      ok: true,
      reminder: reminderRuleToPatientJson(res.data),
      ...(res.syncWarning ? { syncWarning: res.syncWarning } : {}),
    },
    { status: 201 },
  );
}
