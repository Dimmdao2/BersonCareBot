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
