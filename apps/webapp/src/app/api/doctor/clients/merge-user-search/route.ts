/**
 * GET /api/doctor/clients/merge-user-search?q=&limit= — find canonical clients by substring (admin merge UI).
 * Logs: `[admin] merge_user_search` with `qLength` and `resultCount` only (not the raw query string).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/app-layer/db/client";
import { logger } from "@/app-layer/logging/logger";
import { searchMergeUsersForManualMerge } from "@/app-layer/merge/platformUserMergePreview";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";

const querySchema = z.object({
  q: z.string().max(200).optional().default(""),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

export async function GET(request: Request) {
  const adminGate = await requireAdminModeSession();
  if (!adminGate.ok) {
    return adminGate.response;
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const { q, limit } = parsed.data;
  const qTrim = q.trim();
  const qLength = qTrim.length;
  const t0 = Date.now();

  try {
    const rows = await searchMergeUsersForManualMerge(getPool(), qTrim, limit);
    const durationMs = Date.now() - t0;
    logger.info(
      {
        action: "merge_user_search",
        adminUserId: adminGate.session.user.userId,
        qLength,
        resultCount: rows.length,
        durationMs,
      },
      "[admin] merge_user_search",
    );

    return NextResponse.json({
      ok: true,
      users: rows.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        phoneNormalized: r.phone_normalized,
        email: r.email,
        integratorUserId: r.integrator_user_id,
        createdAt: r.created_at.toISOString(),
      })),
    });
  } catch (err) {
    logger.error(
      { err, action: "merge_user_search", adminUserId: adminGate.session.user.userId },
      "[admin] merge_user_search failed",
    );
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
