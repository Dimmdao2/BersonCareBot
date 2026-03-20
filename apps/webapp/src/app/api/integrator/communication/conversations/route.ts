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

  const source = url.searchParams.get("source")?.trim() ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 20), 100) : 20;

  const deps = buildAppDeps();
  if (!deps.supportCommunication) {
    return NextResponse.json({ ok: false, error: "support communication not available" }, { status: 503 });
  }
  const conversations = await deps.supportCommunication.listOpenConversationsForAdmin({
    ...(source ? { source } : {}),
    limit,
  });
  return NextResponse.json({ ok: true, conversations }, { status: 200 });
}
