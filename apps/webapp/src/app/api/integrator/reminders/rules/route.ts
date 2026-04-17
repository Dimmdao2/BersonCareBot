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

  const deps = buildAppDeps();
  if (!deps.reminderProjection) {
    return NextResponse.json({ ok: false, error: "reminder projection not available" }, { status: 503 });
  }
  const rules = await deps.reminderProjection.listRulesByIntegratorUserId(integratorUserId);
  return NextResponse.json({ ok: true, rules }, { status: 200 });
}
