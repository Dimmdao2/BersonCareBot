import { NextResponse } from "next/server";
import { collectAdminSystemHealthData } from "@/app-layer/health/collectAdminSystemHealthData";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";

export async function GET() {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;

  const response = await collectAdminSystemHealthData();
  return NextResponse.json(response);
}
