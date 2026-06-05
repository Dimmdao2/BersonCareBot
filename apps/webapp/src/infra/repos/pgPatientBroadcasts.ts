import { getPool } from "@/infra/db/client";
import { runPgPoolPgText } from "@/infra/db/runWebappSql";
import { extractBroadcastBodyContent } from "@/modules/patient-broadcasts/extractBroadcastBodyContent";
import type { PatientBroadcastsPort, PatientBroadcastView } from "@/modules/patient-broadcasts/ports";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createPgPatientBroadcastsPort(): PatientBroadcastsPort {
  return {
    async getBroadcastForPatient(auditId: string, platformUserId: string): Promise<PatientBroadcastView | null> {
      if (!UUID_RE.test(auditId) || !UUID_RE.test(platformUserId)) return null;
      const pool = getPool();
      const r = await runPgPoolPgText<{
        message_title: string;
        message_body: string;
        executed_at: string;
      }>(
        pool,
        `SELECT a.message_title, a.message_body, a.executed_at
         FROM broadcast_audit a
         INNER JOIN broadcast_audit_recipients r
           ON r.audit_id = a.id AND r.platform_user_id = $2::uuid
         WHERE a.id = $1::uuid
           AND a.preview_only = false
         LIMIT 1`,
        [auditId, platformUserId],
      );
      const row = r.rows[0];
      if (!row) return null;
      const title = String(row.message_title).trim();
      return {
        title,
        body: extractBroadcastBodyContent(title, typeof row.message_body === "string" ? row.message_body : ""),
        executedAt: new Date(String(row.executed_at)).toISOString(),
      };
    },
  };
}
