import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getCurrentSession } from "@/modules/auth/service";
import { canAccessDoctor } from "@/modules/roles/service";

/** Пагинированный список прошедших записей (архив) для ленивой подгрузки. */
export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!canAccessDoctor(session.user.role)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");
  if (view !== "past") {
    return NextResponse.json({ ok: false, error: "invalid_view" }, { status: 400 });
  }

  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));

  const deps = buildAppDeps();
  const appointments = await deps.doctorAppointments.listAppointmentsForSpecialist({
    kind: "past",
    limit,
    offset,
  });

  return NextResponse.json({ ok: true, appointments });
}
