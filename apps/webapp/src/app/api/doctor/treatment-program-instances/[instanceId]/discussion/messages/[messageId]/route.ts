import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ instanceId: string; messageId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { instanceId, messageId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success || !z.string().uuid().safeParse(messageId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const instance = await deps.treatmentProgramInstance.getInstanceById(instanceId);
  if (!instance) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const identity = await deps.doctorClientsPort.getClientIdentity(instance.patientUserId);
  if (!identity) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  if (instance.assignmentSource !== "doctor") {
    return NextResponse.json({ ok: false, error: "program_not_doctor_assigned" }, { status: 400 });
  }

  try {
    await deps.programItemDiscussion.deletePatientMediaMessage({
      messageId,
      patientUserId: instance.patientUserId,
    });
    return NextResponse.json({ ok: true, deleted: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status =
      msg === "message_not_found" ? 404
      : msg === "message_not_media" || msg === "message_not_deletable" ? 400
      : 400;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
