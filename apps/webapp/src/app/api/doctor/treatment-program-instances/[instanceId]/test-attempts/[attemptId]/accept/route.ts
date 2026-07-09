import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import { withDoctorWorkspacePrincipal } from "@/app-layer/principal/withOrganizationPrincipal";
import { doctorTreatmentProgramInstanceRouteErrorStatus } from "@/modules/treatment-program/doctorInstanceRouteErrorStatus";

export async function POST(
  _request: Request,
  context: { params: Promise<{ instanceId: string; attemptId: string }> },
) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;
  const workspace = gate.ctx;

  const { instanceId, attemptId } = await context.params;
  if (!z.string().uuid().safeParse(instanceId).success || !z.string().uuid().safeParse(attemptId).success) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const deps = buildAppDeps();
  try {
    const inst = await deps.treatmentProgramInstance.getInstanceById(instanceId);
    if (!inst) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    const identity = await deps.doctorClientsPort.getClientIdentity(inst.patientUserId);
    if (!identity) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    await withDoctorWorkspacePrincipal(
      workspace,
      "doctor.treatment-program.test-attempt.accept",
      () =>
        deps.treatmentProgramProgress.doctorAcceptTestAttempt({
          instanceId,
          attemptId,
          doctorUserId: workspace.session.user.userId,
        }),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const status = doctorTreatmentProgramInstanceRouteErrorStatus(msg);
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
