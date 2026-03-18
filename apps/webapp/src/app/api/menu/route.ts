import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET() {
  const deps = buildAppDeps();
  const session = await deps.auth.getCurrentSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    items: deps.menu.getMenuForRole(session.user.role),
  });
}
