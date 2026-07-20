import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireStaffSecurityApiSession } from "@/app-layer/guards/requireRole";

export async function GET() {
  const gate = await requireStaffSecurityApiSession();
  if (!gate.ok) return gate.response;
  const status = await buildAppDeps().staffSecurity.getStatus();
  return NextResponse.json({ ok: true, status });
}
