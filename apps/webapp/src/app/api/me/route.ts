import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET() {
  const deps = buildAppDeps();
  const session = await deps.auth.getCurrentSession();

  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const pinRow = await deps.userPins.getByUserId(session.user.userId);

  return NextResponse.json({
    ok: true,
    user: deps.users.getCurrentUser(session),
    security: {
      hasPin: pinRow != null,
    },
  });
}
