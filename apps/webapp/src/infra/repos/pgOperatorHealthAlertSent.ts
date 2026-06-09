import { and, eq, gte } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { operatorHealthAlertSent } from "../../../db/schema/operatorHealthAlertSent";
import type { OperatorAlertDedupPort } from "@/modules/operator-alerts/ports";
import type { OperatorAlertBlock } from "@/modules/operator-alerts/operatorHealthAlertConfig";

export const pgOperatorHealthAlertSentPort: OperatorAlertDedupPort = {
  async wasSentWithinHours(dedupKey: string, hours: number): Promise<boolean> {
    const db = getDrizzle();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const rows = await db
      .select({ id: operatorHealthAlertSent.id })
      .from(operatorHealthAlertSent)
      .where(and(eq(operatorHealthAlertSent.dedupKey, dedupKey), gte(operatorHealthAlertSent.sentAt, since)))
      .limit(1);
    return rows.length > 0;
  },

  async recordSent(input: { dedupKey: string; severity: OperatorAlertBlock }): Promise<void> {
    const db = getDrizzle();
    await db.insert(operatorHealthAlertSent).values({
      dedupKey: input.dedupKey,
      severity: input.severity,
      sentAt: new Date().toISOString(),
    });
  },
};
