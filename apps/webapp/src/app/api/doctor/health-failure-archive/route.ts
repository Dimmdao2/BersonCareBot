import { NextResponse } from "next/server";
import { getCurrentSession } from "@/modules/auth/service";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET(request: Request) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "doctor" && session.user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const limitRaw = url.searchParams.get("limit");
  const limit =
    limitRaw != null && /^\d+$/.test(limitRaw.trim()) ? Math.min(100, Math.max(1, Number.parseInt(limitRaw, 10))) : 50;

  const { items, nextCursor } = await buildAppDeps().healthFailureArchive.listForDoctor({
    doctorUserId: session.user.userId,
    limit,
    cursor,
  });

  return NextResponse.json({ ok: true, items, nextCursor });
}
