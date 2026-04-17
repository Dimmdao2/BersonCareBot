import { NextResponse } from "next/server";
import { assertIntegratorGetRequest } from "@/app-layer/integrator/assertIntegratorGetRequest";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const integratorUserId = url.searchParams.get("integratorUserId")?.trim();
  if (!integratorUserId) {
    return NextResponse.json({ ok: false, error: "integratorUserId required" }, { status: 400 });
  }

  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50;

  const deps = buildAppDeps();
  if (!deps.reminderProjection) {
    return NextResponse.json({ ok: false, error: "reminder projection not available" }, { status: 503 });
  }
  const history = await deps.reminderProjection.listHistoryByIntegratorUserId(integratorUserId, limit);
  return NextResponse.json({ ok: true, history }, { status: 200 });
}
