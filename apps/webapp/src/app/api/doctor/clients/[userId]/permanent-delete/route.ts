/**
 * POST /api/doctor/clients/:userId/permanent-delete — временно закрытый legacy endpoint.
 *
 * Немедленный account purge запрещён до принятой retention state machine. Endpoint сохраняется как
 * fail-closed compatibility surface, чтобы старый UI/операторский вызов не мог обойти запрет.
 */
import { NextResponse } from "next/server";
import { requireDoctorWorkspaceApiContext } from "@/app-layer/guards/requireRole";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";

export async function POST() {
  const adminGate = await requireAdminModeSession();
  if (!adminGate.ok) {
    return adminGate.response;
  }
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) {
    return gate.response;
  }

  return NextResponse.json({ ok: false, error: "account_purge_disabled" }, { status: 409 });
}
