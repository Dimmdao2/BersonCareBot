import { NextResponse } from "next/server";
import { assertIntegratorGetRequest } from "@/app-layer/integrator/assertIntegratorGetRequest";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET(request: Request) {
  const authError = assertIntegratorGetRequest(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const phone = url.searchParams.get("phone")?.trim();
  const telegramId = url.searchParams.get("telegramId")?.trim();
  const maxId = url.searchParams.get("maxId")?.trim();
  if (!phone && !telegramId && !maxId) {
    return NextResponse.json(
      { ok: false, error: "one of phone, telegramId, maxId is required" },
      { status: 400 }
    );
  }

  const deps = buildAppDeps();
  const topic = url.searchParams.get("topic")?.trim();
  const result = await deps.deliveryTargetsApi.getTargets({
    ...(phone ? { phone } : {}),
    ...(telegramId ? { telegramId } : {}),
    ...(maxId ? { maxId } : {}),
    ...(topic ? { topic } : {}),
  });
  if (!result) {
    return NextResponse.json({ ok: true, channelBindings: {} }, { status: 200 });
  }
  return NextResponse.json({ ok: true, channelBindings: result.channelBindings }, { status: 200 });
}
