import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ instanceId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { instanceId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const inst = await deps.treatmentProgramInstance.getInstanceById(instanceId);
    const identity = await deps.doctorClientsPort.getClientIdentity(inst.patientUserId);
    if (!identity) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const events = await deps.treatmentProgramInstance.listProgramEvents(instanceId);
    return NextResponse.json({ ok: true, events });
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
}
