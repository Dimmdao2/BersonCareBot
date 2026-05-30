import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";
import { webappPlatformConversationId } from "@/modules/messaging/supportConversationIds";

const bodySchema = z.object({
  text: z.string().min(1).max(4000),
});

function isSettingEnabled(valueJson: unknown): boolean {
  if (valueJson === null || typeof valueJson !== "object") return false;
  return (valueJson as Record<string, unknown>).value === true;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ instanceId: string; stageItemId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { instanceId, stageItemId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success || !z.string().uuid().safeParse(stageItemId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const enabledFlag = await deps.systemSettings.getSetting(
    "patient_program_discussion_doctor_reply_from_log_enabled",
    "admin",
  );
  if (!isSettingEnabled(enabledFlag?.valueJson ?? null)) {
    return NextResponse.json({ ok: false, error: "feature_disabled" }, { status: 403 });
  }

  const instance = await deps.treatmentProgramInstance.getInstanceById(instanceId);
  if (!instance) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const hasItem = instance.stages.some((stage) => stage.items.some((item) => item.id === stageItemId));
  if (!hasItem) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const result = await deps.sendProgramNoteReply({
    integratorConversationId: webappPlatformConversationId(instance.patientUserId),
    integratorMessageId: `webapp-msg:${crypto.randomUUID()}`,
    stageItemId,
    text: parsed.data.text,
    source: "webapp",
  });
  if (!result.ok) {
    const status = result.error === "stage_item_not_found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({ ok: true });
}
