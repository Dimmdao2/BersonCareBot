/**
 * POST /api/doctor/clients/:userId/permanent-delete — безвозвратное удаление только для заархивированного клиента.
 * Доступ: role=admin и включённый adminMode (как прочие admin API).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { runStrictPurgePlatformUser } from "@/app-layer/merge/strictPlatformUserPurge";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";

const bodySchema = z.object({
  /** Должен совпадать с userId в URL (двойное подтверждение в UI). */
  confirmUserId: z.string().uuid(),
});

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  const adminGate = await requireAdminModeSession();
  if (!adminGate.ok) {
    return adminGate.response;
  }
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) {
    return gate.response;
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  if (parsed.data.confirmUserId !== userId) {
    return NextResponse.json({ ok: false, error: "confirmation_mismatch" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identityInWorkspace = await deps.doctorClientsPort.getClientIdentityForOrganization(
    userId,
    gate.ctx.organizationId,
  );
  if (!identityInWorkspace) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  const targetUserId = identityInWorkspace.userId;

  const role = await deps.doctorClientsPort.getPlatformUserRole(targetUserId);
  if (role !== "client") {
    return NextResponse.json({ ok: false, error: "not_client" }, { status: 404 });
  }

  const identity = await deps.doctorClientsPort.getClientIdentity(targetUserId);
  if (!identity) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!identity.isArchived) {
    return NextResponse.json({ ok: false, error: "must_archive_first" }, { status: 409 });
  }

  const result = await runStrictPurgePlatformUser({
    targetId: targetUserId,
    actorId: adminGate.session.user.userId,
    audit: { enabled: true },
  });

  if (!result.ok) {
    if (result.error === "not_client") {
      return NextResponse.json({ ok: false, error: "not_client" }, { status: 400 });
    }
    if (result.error === "invalid_uuid") {
      return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
    }
    if (result.error === "transaction_failed") {
      return NextResponse.json(
        { ok: false, error: "purge_transaction_failed", message: result.transactionError },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    outcome: result.outcome,
    integratorSkipped: result.integratorSkipped,
    details: result.details,
  });
}
