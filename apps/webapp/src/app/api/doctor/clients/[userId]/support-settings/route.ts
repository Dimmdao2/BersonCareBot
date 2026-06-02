/**
 * GET/PATCH /api/doctor/clients/:userId/support-settings — «На сопровождении» и гейты комментариев/медиа.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const patchBodySchema = z.object({
  onSupport: z.boolean().optional(),
  commentsEnabled: z.boolean().nullable().optional(),
  mediaEnabled: z.boolean().nullable().optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentity(userId);
  if (!identity) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const [profile, policy] = await Promise.all([
    deps.doctorClients.getClientSupport(userId),
    deps.doctorClients.getPatientProgramInteractionPolicy(userId),
  ]);

  return NextResponse.json({
    ok: true,
    profile: profile ?? {
      patientUserId: userId,
      onSupport: false,
      commentsEnabled: null,
      mediaEnabled: null,
      updatedAt: null,
      updatedBy: null,
    },
    effectivePolicy: policy,
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = patchBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentity(userId);
  if (!identity) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const profile = await deps.doctorClients.updateClientSupport({
    patientUserId: userId,
    ...parsed.data,
    actorId: session.user.userId,
  });
  const effectivePolicy = await deps.doctorClients.getPatientProgramInteractionPolicy(userId);

  return NextResponse.json({ ok: true, profile, effectivePolicy });
}
