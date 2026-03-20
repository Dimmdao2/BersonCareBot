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

  const deps = buildAppDeps();
  const port = deps.subscriptionMailingProjection;
  if (!port) {
    return NextResponse.json({ ok: false, error: "subscription projection not available" }, { status: 503 });
  }

  const subscriptions = await port.listSubscriptionsByIntegratorUserId(integratorUserId);
  return NextResponse.json(
    {
      ok: true,
      subscriptions: subscriptions.map((s) => ({
        topicId: s.integratorTopicId,
        topicCode: s.topicCode,
        isActive: s.isActive,
      })),
    },
    { status: 200 }
  );
}
