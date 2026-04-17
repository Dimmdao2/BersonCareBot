import { NextResponse } from "next/server";
import { assertIntegratorGetRequest } from "@/app-layer/integrator/assertIntegratorGetRequest";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const deps = buildAppDeps();
  const port = deps.subscriptionMailingProjection;
  if (!port) {
    return NextResponse.json({ ok: false, error: "subscription projection not available" }, { status: 503 });
  }

  const topics = await port.listTopics();
  return NextResponse.json(
    { ok: true, topics: topics.map((t) => ({ id: t.integratorTopicId, code: t.code, title: t.title, key: t.key, isActive: t.isActive })) },
    { status: 200 }
  );
}
