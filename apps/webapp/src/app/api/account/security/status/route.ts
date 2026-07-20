import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorApiSession } from "@/app-layer/guards/requireRole";

export async function GET() {
  const gate = await requireDoctorApiSession();
  if (!gate.ok) return gate.response;
  const status = await buildAppDeps().staffSecurity.getStatus(gate.session.user.userId);
  return NextResponse.json({ ok: true, status });
}
