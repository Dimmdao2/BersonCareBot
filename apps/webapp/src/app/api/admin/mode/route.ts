/**
 * POST /api/admin/mode — toggle adminMode в сессии.
 * Guard: role === 'admin'. Вариант A (toggle + confirm dialog).
 */
import { NextResponse } from "next/server";
import { getCurrentSession, toggleAdminMode } from "@/modules/auth/service";

export async function POST() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const result = await toggleAdminMode();
  return NextResponse.json({ ok: result.ok, adminMode: result.adminMode });
}
