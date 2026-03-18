import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function POST() {
  const deps = buildAppDeps();
  await deps.auth.clearSession();
  return NextResponse.json({ ok: true });
}
