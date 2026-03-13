import { NextResponse } from "next/server";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";

export async function GET() {
  const deps = buildAppDeps();
  const db = (await deps.health.checkDbHealth()) ? "up" : "down";

  return NextResponse.json({
    ok: true,
    db,
  });
}
