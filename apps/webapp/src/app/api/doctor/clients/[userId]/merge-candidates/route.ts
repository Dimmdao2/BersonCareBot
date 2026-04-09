/**
 * GET /api/doctor/clients/:userId/merge-candidates — canonical clients that may duplicate the anchor
 * (shared phone, email, integrator id, or messenger binding). Admin + admin mode only.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/infra/db/client";
import { searchMergeCandidates } from "@/infra/platformUserMergePreview";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  const adminGate = await requireAdminModeSession();
  if (!adminGate.ok) {
    return adminGate.response;
  }

  const { userId } = await context.params;
  if (!z.string().uuid().safeParse(userId).success) {
    return NextResponse.json({ ok: false, error: "invalid_user" }, { status: 400 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q");

  const result = await searchMergeCandidates(getPool(), userId, q);
  if (!result.ok) {
    if (result.error === "not_found") {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    if (result.error === "not_client") {
      return NextResponse.json({ ok: false, error: "not_client" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "anchor_is_alias" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    anchorUserId: result.anchorUserId,
    candidates: result.candidates.map((c) => ({
      id: c.id,
      displayName: c.display_name,
      phoneNormalized: c.phone_normalized,
      email: c.email,
      integratorUserId: c.integrator_user_id,
      createdAt: c.created_at.toISOString(),
    })),
  });
}
