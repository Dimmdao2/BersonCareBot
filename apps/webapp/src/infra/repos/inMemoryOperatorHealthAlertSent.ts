import type { OperatorAlertDedupPort } from "@/modules/operator-alerts/ports";
import type { OperatorAlertBlock } from "@/modules/operator-alerts/operatorHealthAlertConfig";

type Row = { dedupKey: string; severity: OperatorAlertBlock; sentAt: string };

const rows: Row[] = [];

export const inMemoryOperatorHealthAlertSentPort: OperatorAlertDedupPort = {
  async wasSentWithinHours(dedupKey: string, hours: number): Promise<boolean> {
    const since = Date.now() - hours * 60 * 60 * 1000;
    return rows.some((r) => r.dedupKey === dedupKey && Date.parse(r.sentAt) >= since);
  },

  async recordSent(input: { dedupKey: string; severity: OperatorAlertBlock }): Promise<void> {
    rows.push({ ...input, sentAt: new Date().toISOString() });
  },

  async getLatestSentAtByDedupKeyPrefix(prefix: string): Promise<string | null> {
    const matched = rows
      .filter((r) => r.dedupKey.startsWith(prefix))
      .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt));
    return matched[0]?.sentAt ?? null;
  },
};

export function resetInMemoryOperatorHealthAlertSent(): void {
  rows.length = 0;
}
