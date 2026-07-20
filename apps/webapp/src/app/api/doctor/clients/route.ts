/**
 * POST /api/doctor/clients — создать organization-owned клиента (телефон обязателен; email → ссылка на вход).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { createDoctorClient } from "@/app-layer/doctor/createDoctorClient";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import { withDoctorWorkspacePrincipal } from "@/app-layer/guards/doctorWorkspacePrincipal";

const bodySchema = z.object({
  displayName: z.string().max(500).nullable().optional(),
  phone: z.string().min(1).max(100),
  email: z.string().max(320).nullable().optional(),
});

export async function POST(request: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const patientOrganization = deps.patientOrganization;
  if (!patientOrganization) {
    return NextResponse.json({ ok: false, error: "client_creation_unavailable" }, { status: 503 });
  }

  const result = await withDoctorWorkspacePrincipal(gate.ctx, "doctor.clients.create", () =>
    createDoctorClient(
      {
        organizationId: gate.ctx.organizationId,
        createdByUserId: gate.ctx.session.user.userId,
        displayName: parsed.data.displayName,
        phone: parsed.data.phone,
        email: parsed.data.email,
      },
      {
        patientOrganization,
        emailSetupAccess: deps.emailSetupAccess,
      },
    ),
  );

  if (!result.ok) {
    const status =
      result.error === "email_conflict" ? 409 : result.error.startsWith("invalid_") ? 400 : 409;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  return NextResponse.json({
    ok: true,
    client: {
      id: result.userId,
      displayName: result.displayName,
      firstName: null,
      lastName: null,
      patronymic: null,
      phone: result.phoneNormalized,
    },
    created: result.created,
    emailSetupEnqueued: result.emailSetupEnqueued,
  });
}
