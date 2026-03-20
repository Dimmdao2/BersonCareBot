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

  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50;

  const deps = buildAppDeps();
  if (!deps.supportCommunication) {
    return NextResponse.json({ ok: false, error: "support communication not available" }, { status: 503 });
  }
  const questions = await deps.supportCommunication.listUnansweredQuestionsForAdmin({ limit });
  return NextResponse.json({ ok: true, questions }, { status: 200 });
}
