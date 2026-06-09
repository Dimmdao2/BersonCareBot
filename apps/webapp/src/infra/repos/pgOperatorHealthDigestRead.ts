import { and, count, eq, gte, isNotNull, lt } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { adminAuditLog } from "../../../db/schema/schema";
import { operatorIncidents, operatorJobStatus } from "../../../db/schema/operatorHealth";
import type { OperatorHealthDigestReadPort } from "@/modules/operator-health/digestPorts";

export const pgOperatorHealthDigestReadPort: OperatorHealthDigestReadPort = {
  async countAuditErrorsInWindow(windowStartIso: string, windowEndIso: string): Promise<number> {
    const db = getDrizzle();
    const [row] = await db
      .select({ n: count() })
      .from(adminAuditLog)
      .where(
        and(
          gte(adminAuditLog.createdAt, windowStartIso),
          lt(adminAuditLog.createdAt, windowEndIso),
          eq(adminAuditLog.status, "error"),
        ),
      );
    return Number(row?.n ?? 0);
  },

  async hadOperatorIncidentsResolveAllInWindow(
    windowStartIso: string,
    windowEndIso: string,
  ): Promise<boolean> {
    const db = getDrizzle();
    const [row] = await db
      .select({ n: count() })
      .from(adminAuditLog)
      .where(
        and(
          gte(adminAuditLog.createdAt, windowStartIso),
          lt(adminAuditLog.createdAt, windowEndIso),
          eq(adminAuditLog.action, "operator_incidents_resolve_all"),
        ),
      );
    return Number(row?.n ?? 0) > 0;
  },

  async listIncidentsOpenedInWindow(windowStartIso: string, windowEndIso: string) {
    const db = getDrizzle();
    const rows = await db
      .select({
        integration: operatorIncidents.integration,
        errorClass: operatorIncidents.errorClass,
      })
      .from(operatorIncidents)
      .where(
        and(
          gte(operatorIncidents.openedAt, windowStartIso),
          lt(operatorIncidents.openedAt, windowEndIso),
        ),
      );
    return rows;
  },

  async listIncidentsResolvedInWindow(windowStartIso: string, windowEndIso: string) {
    const db = getDrizzle();
    const rows = await db
      .select({
        integration: operatorIncidents.integration,
        errorClass: operatorIncidents.errorClass,
      })
      .from(operatorIncidents)
      .where(
        and(
          isNotNull(operatorIncidents.resolvedAt),
          gte(operatorIncidents.resolvedAt, windowStartIso),
          lt(operatorIncidents.resolvedAt, windowEndIso),
        ),
      );
    return rows;
  },

  async listJobFailuresInWindow(windowStartIso: string, windowEndIso: string) {
    const db = getDrizzle();
    const rows = await db
      .select({
        jobFamily: operatorJobStatus.jobFamily,
        jobKey: operatorJobStatus.jobKey,
        lastFailureAt: operatorJobStatus.lastFailureAt,
      })
      .from(operatorJobStatus)
      .where(
        and(
          isNotNull(operatorJobStatus.lastFailureAt),
          gte(operatorJobStatus.lastFailureAt, windowStartIso),
          lt(operatorJobStatus.lastFailureAt, windowEndIso),
        ),
      );
    return rows.map((r) => ({
      jobFamily: r.jobFamily,
      jobKey: r.jobKey,
      lastFailureAt: r.lastFailureAt!,
    }));
  },
};
