import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const APP_STARTED_AT = Date.now();

function resolveBuildId(): string {
  const envBuildId = process.env.BUILD_ID || process.env.NEXT_PUBLIC_BUILD_ID;
  if (envBuildId && envBuildId.trim().length > 0) {
    return envBuildId.trim();
  }

  return String(APP_STARTED_AT);
}

export async function GET() {
  const buildId = resolveBuildId();
  return NextResponse.json(
    {
      buildId,
      startedAt: APP_STARTED_AT,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    },
  );
}
