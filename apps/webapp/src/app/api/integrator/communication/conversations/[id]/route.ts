import { NextResponse } from "next/server";
import { verifyIntegratorGetSignature } from "@/infra/webhooks/verifyIntegratorSignature";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "conversation id required" }, { status: 400 });
  }

  const deps = buildAppDeps();
  if (!deps.supportCommunication) {
    return NextResponse.json({ ok: false, error: "support communication not available" }, { status: 503 });
  }
  const conversation = await deps.supportCommunication.getConversationByIntegratorId(id.trim());
  if (!conversation) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, conversation }, { status: 200 });
}
