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
  const result = await deps.deliveryTargetsApi.getTargets({
    ...(phone ? { phone } : {}),
    ...(telegramId ? { telegramId } : {}),
    ...(maxId ? { maxId } : {}),
  });
  if (!result) {
    return NextResponse.json({ ok: true, channelBindings: {} }, { status: 200 });
  }
  return NextResponse.json({ ok: true, channelBindings: result.channelBindings }, { status: 200 });
}
