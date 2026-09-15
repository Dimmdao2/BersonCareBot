import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type { OperatorAlertDedupPort } from '@/modules/operator-alerts/ports';
import type { OperatorAlertBlock } from '@/modules/operator-alerts/operatorHealthAlertConfig';

const DEDUP_ROOT_IDENTITY = 'app.manage_operator_health_alert_dedup(text,text,integer,text)';

type DedupRootResult = {
  wasSent?: boolean;
  recorded?: boolean;
  latestSentAt?: string | null;
};

async function runDedupRoot(
  action: 'was_sent' | 'record_sent' | 'latest_for_prefix',
  key: string,
  hours: number,
  severity: OperatorAlertBlock | '',
): Promise<DedupRootResult> {
  const result = await runWebappNamedRoot<{ result: DedupRootResult }>(
    getWebappSqlDb(),
    DEDUP_ROOT_IDENTITY,
    [action, key, hours, severity],
    sql`SELECT app.manage_operator_health_alert_dedup(
      ${action}, ${key}, ${hours}, ${severity}
    ) AS result`,
  );
  return result.rows[0]?.result ?? {};
}

export const pgOperatorHealthAlertSentPort: OperatorAlertDedupPort = {
  async wasSentWithinHours(dedupKey: string, hours: number): Promise<boolean> {
    const result = await runDedupRoot('was_sent', dedupKey, hours, '');
    return result.wasSent === true;
  },

  async recordSent(input: { dedupKey: string; severity: OperatorAlertBlock }): Promise<void> {
    const result = await runDedupRoot('record_sent', input.dedupKey, 0, input.severity);
    if (result.recorded !== true) throw new Error('operator_alert_dedup_record_failed');
  },

  async getLatestSentAtByDedupKeyPrefix(prefix: string): Promise<string | null> {
    const result = await runDedupRoot('latest_for_prefix', prefix, 0, '');
    return typeof result.latestSentAt === 'string' ? result.latestSentAt : null;
  },
};
