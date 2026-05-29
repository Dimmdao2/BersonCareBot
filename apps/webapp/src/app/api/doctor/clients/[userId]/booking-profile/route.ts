/**
 * GET/PATCH /api/doctor/clients/:userId/booking-profile — booking-репутация (отдельно от messaging block).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const patchBodySchema = z.object({
  isProblematic: z.boolean().optional(),
  bookingBlocked: z.boolean().optional(),
  problematicNote: z.string().max(2000).nullable().optional(),
});

async function resolveClient(userId: string) {
  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentity(userId);
  if (!identity) return { error: NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }) };
  if (!deps.bookingEngine) {
    return { error: NextResponse.json({ ok: false, error: "booking_unavailable" }, { status: 503 }) };
  }
  const orgId = await deps.bookingEngine.organization.getDefaultOrganizationId();
  return { deps, orgId };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  }

  const resolved = await resolveClient(userId);
  if ("error" in resolved && resolved.error) return resolved.error;
  const { deps, orgId } = resolved as { deps: ReturnType<typeof buildAppDeps>; orgId: string };

  const profile = await deps.clientHistory.getBookingProfile(orgId, userId);
  return NextResponse.json({
    ok: true,
    profile: profile ?? {
      platformUserId: userId,
      organizationId: orgId,
      isProblematic: false,
      bookingBlocked: false,
      problematicNote: null,
      updatedAt: null,
      updatedBy: null,
    },
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
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

  const resolved = await resolveClient(userId);
  if ("error" in resolved && resolved.error) return resolved.error;
  const { deps, orgId } = resolved as { deps: ReturnType<typeof buildAppDeps>; orgId: string };

  const profile = await deps.clientHistory.upsertBookingProfile({
    organizationId: orgId,
    platformUserId: userId,
    ...parsed.data,
    updatedBy: session.user.userId,
  });

  return NextResponse.json({ ok: true, profile });
}
