import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/app-layer/admin/auditLog";
import { getPool } from "@/app-layer/db/client";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { logger } from "@/app-layer/logging/logger";
import { requireAdminModeSession } from "@/modules/auth/requireAdminMode";
import {
  HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE,
  HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE,
  HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE,
} from "@/modules/operator-health/healthFailureArchiveConstants";

const bodySchema = z.object({
  probe: z.enum([
    HEALTH_FAILURE_ARCHIVE_OUTGOING_PROBE,
    HEALTH_FAILURE_ARCHIVE_INTEGRATOR_OUTBOX_PROBE,
    HEALTH_FAILURE_ARCHIVE_PROJECTION_PROBE,
    HEALTH_FAILURE_ARCHIVE_OUTGOING_REMINDER_PROBE,
  ]),
});

export async function POST(request: Request) {
  const gate = await requireAdminModeSession();
  if (!gate.ok) return gate.response;

  const raw = (await request.json().catch(() => null)) as unknown;
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const { inserted, deleted } = await buildAppDeps().healthFailureArchive.clearDeadForProbe({
    probe: parsed.data.probe,
    archivedByUserId: gate.session.user.userId,
  });

  logger.info(
    { probe: parsed.data.probe, inserted, deleted, actorId: gate.session.user.userId },
    "health_failure_archive.clear_dead",
  );

  await writeAuditLog(getPool(), {
    actorId: gate.session.user.userId,
    action: "health_failure_archive_clear_dead",
    details: {
      probe: parsed.data.probe,
      inserted,
      deleted,
    },
    status: "ok",
  });

  return NextResponse.json({ ok: true, inserted, deleted });
}
