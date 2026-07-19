/** Global patient merge is intentionally unavailable in U1. */
import { NextResponse } from "next/server";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";

export async function POST() {
  const adminGate = await requireAdminModeSession();
  if (!adminGate.ok) return adminGate.response;
  return NextResponse.json({ ok: false, error: "not_available" }, { status: 404 });
}
