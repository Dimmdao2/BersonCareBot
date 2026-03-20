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
