/**
 * DELETE /api/doctor/clients/:userId/supplementary-contacts/:contactId
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { PlatformUserContactValidationError } from "@/modules/platform-user-contacts/types";
import { canAccessDoctor } from "@/modules/roles/service";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string; contactId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { userId, contactId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success || !z.string().uuid().safeParse(contactId).success) {
    return NextResponse.json({ ok: false, error: "invalid_params" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentity(userId);
  if (!identity) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  try {
    const deleted = await deps.platformUserContacts.deleteStaffManagedContact({
      id: contactId,
      platformUserId: userId,
    });
    if (!deleted) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof PlatformUserContactValidationError && e.code === "delete_not_allowed") {
      return NextResponse.json({ ok: false, error: "delete_not_allowed" }, { status: 403 });
    }
    throw e;
  }
}
