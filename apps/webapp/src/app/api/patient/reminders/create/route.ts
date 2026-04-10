import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePatientApiSessionWithPhone } from "@/app-layer/guards/requireRole";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { routePaths } from "@/app-layer/routes/paths";
import type { ReminderLinkedObjectType } from "@/modules/reminders/types";
import { reminderRuleToPatientJson } from "../reminderPatientJson";

const LINKED_TYPES = new Set<ReminderLinkedObjectType>([
  "lfk_complex",
  "content_section",
  "content_page",
  "custom",
]);

export async function POST(req: Request) {
  const gate = await requirePatientApiSessionWithPhone({ returnPath: routePaths.patientReminders });
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

  const intervalMinutes = schedule.intervalMinutes;
  const windowStartMinute = schedule.windowStartMinute;
  const windowEndMinute = schedule.windowEndMinute;
  const daysMask = schedule.daysMask;
  if (
    typeof intervalMinutes !== "number" ||
    typeof windowStartMinute !== "number" ||
    typeof windowEndMinute !== "number" ||
    typeof daysMask !== "string"
  ) {
    return NextResponse.json({ ok: false, error: "validation_error" }, { status: 400 });
  }

  const sched = { intervalMinutes, windowStartMinute, windowEndMinute, daysMask };
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
