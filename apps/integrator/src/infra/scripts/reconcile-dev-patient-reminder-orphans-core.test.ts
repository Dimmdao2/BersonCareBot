import { describe, expect, it } from 'vitest';
import {
  reconcileExactPatientReminderOrphans,
  type ReminderOrphanReconcilePort,
} from './reconcile-dev-patient-reminder-orphans-core.js';

const expected = ['rule-a', 'rule-b'] as const;

describe('DEV patient reminder orphan reconcile transaction', () => {
  it('rolls back instead of committing when only one of two exact rules was updated', async () => {
    let committed = false;
    let rolledBack = false;
    const port: ReminderOrphanReconcilePort = {
      async tx(work) {
        try {
          const result = await work({
            listExactActiveOrphans: async () => expected.map((id) => ({ id })),
            disableExactActiveOrphans: async () => [{ id: expected[0] }],
          });
          committed = true;
          return result;
        } catch (error) {
          rolledBack = true;
          throw error;
        }
      },
    };

    await expect(reconcileExactPatientReminderOrphans(port, expected)).rejects.toThrow(
      'reconcile_atomic_updated_expected_rule-a,rule-b_received_rule-a',
    );
    expect({ committed, rolledBack }).toEqual({ committed: false, rolledBack: true });
  });

  it('refuses an unexpected candidate ID before issuing the update', async () => {
    let updateCalled = false;
    const port: ReminderOrphanReconcilePort = {
      tx: async (work) =>
        work({
          listExactActiveOrphans: async () => [{ id: 'rule-a' }, { id: 'rule-c' }],
          disableExactActiveOrphans: async () => {
            updateCalled = true;
            return [];
          },
        }),
    };

    await expect(reconcileExactPatientReminderOrphans(port, expected)).rejects.toThrow(
      'reconcile_atomic_candidates_expected_rule-a,rule-b_received_rule-a,rule-c',
    );
    expect(updateCalled).toBe(false);
  });
});
