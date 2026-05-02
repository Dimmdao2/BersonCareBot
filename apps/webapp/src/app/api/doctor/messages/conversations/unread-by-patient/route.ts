/**
 * POST /api/doctor/messages/conversations/unread-by-patient — unread count по patientUserId без создания диалога.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

const bodySchema = z.object({
  patientUserId: z.string().uuid(),
});

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const identity = await deps.doctorClientsPort.getClientIdentity(parsed.data.patientUserId);
  if (!identity) {
    return NextResponse.json({ ok: false, error: "patient_not_found" }, { status: 404 });
  }
  const unreadCount = await deps.messaging.doctorSupport.unreadFromPatient(parsed.data.patientUserId);
  return NextResponse.json({ ok: true, unreadCount });
}
