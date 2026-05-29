import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

export async function GET() {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  if (!deps.patientMergeCandidate) {
    return NextResponse.json({ ok: false, error: "merge_candidates_unavailable" }, { status: 503 });
  }
  const candidates = await deps.patientMergeCandidate.listPending(gate.ctx.organizationId);
  return NextResponse.json({ ok: true, candidates });
}
