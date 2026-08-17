export type ReminderOrphanRuleRow = { id: string };

export type ReminderOrphanReconcileTransaction = {
  listExactActiveOrphans(): Promise<ReminderOrphanRuleRow[]>;
  disableExactActiveOrphans(): Promise<ReminderOrphanRuleRow[]>;
};

export type ReminderOrphanReconcilePort = {
  tx<T>(work: (transaction: ReminderOrphanReconcileTransaction) => Promise<T>): Promise<T>;
};

function exactIds(rows: readonly ReminderOrphanRuleRow[]): string[] {
  return rows.map(({ id }) => id).sort();
}

function assertExactIds(
  stage: 'candidates' | 'updated',
  rows: readonly ReminderOrphanRuleRow[],
  expectedRuleIds: readonly string[],
): void {
  const actual = exactIds(rows);
  const expected = [...expectedRuleIds].sort();
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error(
      `reconcile_atomic_${stage}_expected_${expected.join(',')}_received_${actual.join(',') || 'none'}`,
    );
  }
}

/** The transaction may commit only after both the candidate set and the returned update set match exactly. */
export async function reconcileExactPatientReminderOrphans(
  port: ReminderOrphanReconcilePort,
  expectedRuleIds: readonly string[],
): Promise<{ candidates: ReminderOrphanRuleRow[]; updated: ReminderOrphanRuleRow[] }> {
  return port.tx(async (transaction) => {
    const candidates = await transaction.listExactActiveOrphans();
    assertExactIds('candidates', candidates, expectedRuleIds);
    const updated = await transaction.disableExactActiveOrphans();
    assertExactIds('updated', updated, expectedRuleIds);
    return { candidates, updated };
  });
}
