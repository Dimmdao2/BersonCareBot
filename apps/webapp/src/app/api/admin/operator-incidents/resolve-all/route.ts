import { NextResponse } from "next/server";
import { writeAuditLog } from "@/app-layer/admin/auditLog";
import { getPool } from "@/app-layer/db/client";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger } from "@/app-layer/logging/logger";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";

export async function POST() {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;

  const { resolved } = await buildAppDeps().operatorHealthWrite.resolveAllOpenIncidents();

  logger.info(
    { resolved, actorId: gate.session.user.userId },
    "operator_incidents.resolve_all",
  );

  await writeAuditLog(getPool(), {
    actorId: gate.session.user.userId,
    action: "operator_incidents_resolve_all",
    details: { resolved },
    status: "ok",
  });

  return NextResponse.json({ ok: true, resolved });
}
