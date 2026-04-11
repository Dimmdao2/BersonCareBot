/**
 * GET /api/doctor/clients/name-match-hints — probable name overlap hints (admin review only).
 * Logs: `[admin] name_match_hints` with aggregates only (no raw PII arrays).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/infra/db/client";
import { logger } from "@/infra/logging/logger";
import { buildNameMatchHintsReport } from "@/infra/platformUserNameMatchHints";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";

const querySchema = z.object({
  missingPhone: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
  limitGroups: z.coerce.number().int().min(1).max(500).optional().default(100),
  limitMembersPerGroup: z.coerce.number().int().min(1).max(100).optional().default(20),
  limitSwappedPairs: z.coerce.number().int().min(1).max(2000).optional().default(500),
});

function serializeMember(m: {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  phone_normalized: string | null;
  integrator_user_id: string | null;
  created_at: Date;
}) {
  return {
    id: m.id,
    displayName: m.display_name,
    firstName: m.first_name,
    lastName: m.last_name,
    phoneNormalized: m.phone_normalized,
    integratorUserId: m.integrator_user_id,
    createdAt: m.created_at.toISOString(),
  };
}

export async function GET(request: Request) {
  const adminGate = await requireAdminModeSession();
  if (!adminGate.ok) {
    return adminGate.response;
  }

  const url = new URL(request.url);
  const raw = {
    missingPhone: url.searchParams.get("missingPhone") ?? undefined,
    limitGroups: url.searchParams.get("limitGroups") ?? undefined,
    limitMembersPerGroup: url.searchParams.get("limitMembersPerGroup") ?? undefined,
    limitSwappedPairs: url.searchParams.get("limitSwappedPairs") ?? undefined,
  };
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
  }

  const opts = parsed.data;
  const missingPhone = opts.missingPhone ?? false;
  const t0 = Date.now();
  try {
    const report = await buildNameMatchHintsReport(getPool(), {
      missingPhone,
      limitGroups: opts.limitGroups,
      limitMembersPerGroup: opts.limitMembersPerGroup,
      limitSwappedPairs: opts.limitSwappedPairs,
    });

    const durationMs = Date.now() - t0;
    logger.info(
      {
        action: "name_match_hints",
        adminUserId: adminGate.session.user.userId,
        missingPhone,
        orderedGroupCount: report.orderedGroups.length,
        swappedPairCount: report.swappedPairs.length,
        durationMs,
      },
      "[admin] name_match_hints",
    );

    return NextResponse.json({
      ok: true,
      disclaimer: report.disclaimer,
      orderedGroups: report.orderedGroups.map((g) => ({
        normalizedFirst: g.normalizedFirst,
        normalizedLast: g.normalizedLast,
        members: g.members.map(serializeMember),
      })),
      swappedPairs: report.swappedPairs.map((p) => ({
        userA: serializeMember(p.userA),
        userB: serializeMember(p.userB),
      })),
    });
  } catch (err) {
    logger.error({ err, action: "name_match_hints", adminUserId: adminGate.session.user.userId }, "[admin] name_match_hints failed");
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
