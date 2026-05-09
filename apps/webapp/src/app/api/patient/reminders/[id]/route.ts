import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePatientApiBusinessAccess } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import type { UpdateRuleData } from "@/modules/reminders/service";
import type { SlotsV1ScheduleData } from "@/modules/reminders/scheduleSlots";
import { SLOTS_V1_DB_PLACEHOLDER } from "@/modules/reminders/scheduleSlots";
import { reminderRuleToPatientJson } from "../reminderPatientJson";

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

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientReminders });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const { id: ruleId } = await context.params;
  if (!ruleId?.trim()) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  if (Object.keys(body).length === 0) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const patch: UpdateRuleData = {};

  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

  if (body.schedule != null && typeof body.schedule === "object") {
    const s = body.schedule as Record<string, unknown>;
    if (s.scheduleType === "interval_window" || s.scheduleType === "slots_v1") {
      const daysMask = s.daysMask;
      if (typeof daysMask !== "string" || !/^[01]{7}$/.test(daysMask)) {
        return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
      }
      const quietParsed = parseQuietFromSchedule(s);
      if (!quietParsed.ok) {
        return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
      }
      if (s.scheduleType === "slots_v1") {
        const sd = s.scheduleData;
        if (sd != null && typeof sd !== "object") {
          return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
        }
        patch.schedule = {
          scheduleType: "slots_v1",
          intervalMinutes: SLOTS_V1_DB_PLACEHOLDER.intervalMinutes,
          windowStartMinute: SLOTS_V1_DB_PLACEHOLDER.windowStartMinute,
          windowEndMinute: SLOTS_V1_DB_PLACEHOLDER.windowEndMinute,
          daysMask,
          scheduleData:
            sd === undefined || sd === null ? undefined : (sd as SlotsV1ScheduleData),
          quietHoursStartMinute: quietParsed.quietHoursStartMinute ?? null,
          quietHoursEndMinute: quietParsed.quietHoursEndMinute ?? null,
        };
      } else {
        const intervalMinutes = s.intervalMinutes;
        const windowStartMinute = s.windowStartMinute;
        const windowEndMinute = s.windowEndMinute;
        if (
          typeof intervalMinutes !== "number" ||
          typeof windowStartMinute !== "number" ||
          typeof windowEndMinute !== "number"
        ) {
          return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
        }
        patch.schedule = {
          scheduleType: "interval_window",
          intervalMinutes,
          windowStartMinute,
          windowEndMinute,
          daysMask,
          quietHoursStartMinute: quietParsed.quietHoursStartMinute ?? null,
          quietHoursEndMinute: quietParsed.quietHoursEndMinute ?? null,
        };
      }
    } else {
      if (typeof s.intervalMinutes === "number") patch.intervalMinutes = s.intervalMinutes;
      if (typeof s.windowStartMinute === "number") patch.windowStartMinute = s.windowStartMinute;
      if (typeof s.windowEndMinute === "number") patch.windowEndMinute = s.windowEndMinute;
      if (typeof s.daysMask === "string") patch.daysMask = s.daysMask;
    }
  }

  if ("customTitle" in body) {
    if (body.customTitle !== null && typeof body.customTitle !== "string") {
      return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
    }
    patch.customTitle = body.customTitle === null ? null : body.customTitle;
  }
  if ("customText" in body) {
    if (body.customText !== null && typeof body.customText !== "string") {
      return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
    }
    patch.customText = body.customText === null ? null : body.customText;
  }

  const hasAnyPatch =
    patch.enabled !== undefined ||
    patch.schedule !== undefined ||
    patch.intervalMinutes !== undefined ||
    patch.windowStartMinute !== undefined ||
    patch.windowEndMinute !== undefined ||
    patch.daysMask !== undefined ||
    patch.customTitle !== undefined ||
    patch.customText !== undefined;
  if (!hasAnyPatch) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  if (typeof patch.customTitle === "string" && patch.customTitle.length > 140) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }
  if (typeof patch.customText === "string" && patch.customText.length > 2000) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const res = await deps.reminders.updateRule(session.user.userId, ruleId, patch);
  if (!res.ok) {
    const status = res.error === "not_found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: res.error }, { status });
  }
  revalidatePath(routePaths.patientReminders);
  revalidatePath(routePaths.patient);
  return NextResponse.json({
    ok: true,
    reminder: reminderRuleToPatientJson(res.data),
    ...(res.syncWarning ? { syncWarning: res.syncWarning } : {}),
  });
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientReminders });
  if (!gate.ok) return gate.response;
  const session = gate.session;

  const { id: ruleId } = await context.params;
  if (!ruleId?.trim()) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const res = await deps.reminders.deleteReminder(session.user.userId, ruleId);
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: res.error }, { status: 404 });
  }
  revalidatePath(routePaths.patientReminders);
  revalidatePath(routePaths.patient);
  return NextResponse.json({ ok: true, deletedId: res.data.deletedId });
}
