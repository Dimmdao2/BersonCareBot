import { NextResponse } from "next/server";
import { verifyIntegratorGetSignature } from "@/infra/webhooks/verifyIntegratorSignature";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET(request: Request) {
  const timestamp = request.headers.get("x-bersoncare-timestamp");
  const signature = request.headers.get("x-bersoncare-signature");
  if (!timestamp || !signature) {
    return NextResponse.json({ ok: false, error: "missing webhook headers" }, { status: 400 });
  }

  const url = new URL(request.url);
  const canonicalGet = `GET ${url.pathname}${url.search}`;
  if (!verifyIntegratorGetSignature(timestamp, canonicalGet, signature)) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 401 });
  }

  const integratorRecordId = url.searchParams.get("integratorRecordId")?.trim();
  if (!integratorRecordId) {
    return NextResponse.json({ ok: false, error: "integratorRecordId required" }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.appointmentProjection) {
    return NextResponse.json({ ok: false, error: "appointment projection not available" }, { status: 503 });
  }
  const row = await deps.appointmentProjection.getRecordByIntegratorId(integratorRecordId);
  const record = row
    ? {
        externalRecordId: row.integratorRecordId,
        phoneNormalized: row.phoneNormalized,
        recordAt: row.recordAt,
        status: row.status,
        payloadJson: row.payloadJson,
      }
    : null;
  return NextResponse.json({ ok: true, record }, { status: 200 });
}
