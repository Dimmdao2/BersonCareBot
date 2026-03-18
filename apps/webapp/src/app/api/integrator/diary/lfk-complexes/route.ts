import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { verifyIntegratorGetSignature } from "@/infra/webhooks/verifyIntegratorSignature";

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

  const userId = url.searchParams.get("userId");
  if (!userId || userId.trim() === "") {
    return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  }

  const deps = buildAppDeps();
  const complexes = await deps.diaries.listLfkComplexes(userId.trim(), true);
  return NextResponse.json({ ok: true, complexes });
}
