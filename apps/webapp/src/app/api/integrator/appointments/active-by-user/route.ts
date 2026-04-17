import { NextResponse } from "next/server";
import { assertIntegratorGetRequest } from "@/app-layer/integrator/assertIntegratorGetRequest";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

function linkFromPayload(payload: Record<string, unknown>): string | null {
  const link = payload.link;
  if (typeof link === "string" && link.trim()) return link.trim();
  const url = payload.url;
  if (typeof url === "string" && url.trim()) return url.trim();
  const recordUrl = payload.record_url;
  if (typeof recordUrl === "string" && recordUrl.trim()) return recordUrl.trim();
  return null;
}

export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const phoneNormalized = url.searchParams.get("phoneNormalized")?.trim();
  if (!phoneNormalized) {
    return NextResponse.json({ ok: false, error: "phoneNormalized required" }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.appointmentProjection) {
    return NextResponse.json({ ok: false, error: "appointment projection not available" }, { status: 503 });
  }
  const rows = await deps.appointmentProjection.listActiveByPhoneNormalized(phoneNormalized);
  const records = rows.map((row) => ({
    rubitimeRecordId: row.integratorRecordId,
    recordAt: row.recordAt,
    status: row.status,
    link: linkFromPayload(row.payloadJson),
  }));
  return NextResponse.json({ ok: true, records }, { status: 200 });
}
