/**
 * DELETE /api/doctor/account/email — сброс email у своего аккаунта врача/админа.
 */
import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";

export async function DELETE() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "doctor" && session.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const result = await buildAppDeps().userProjection.clearStaffAccountEmail(session.user.userId);
  if (!result.ok) {
    if (result.reason === "already_empty") {
      return NextResponse.json({ ok: false, error: "already_empty" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
