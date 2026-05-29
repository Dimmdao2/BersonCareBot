import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../../../_requireAdminBookingEngine";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const deps = buildAppDeps();
  if (!deps.patientMergeCandidate) {
    return NextResponse.json({ ok: false, error: "merge_candidates_unavailable" }, { status: 503 });
  }
  const ok = await deps.patientMergeCandidate.dismiss(id, gate.ctx.session.user.userId);
  if (!ok) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
