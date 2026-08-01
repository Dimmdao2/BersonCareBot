import { describe, expect, it } from 'vitest';
import { diffTariffPolicySnapshots } from './policyHistoryDiff';

/**
 * §5a item 2.11 — a policy edit must leave a readable "было → стало" record for BOTH ladder
 * subjects (owner: «без него нельзя будет объяснить клинике, почему она получила блок»). This is
 * the one test the item earns (`AGENTS.md` §10a): the failure is expensive (an unexplainable block)
 * and silent (a dropped subject in the diff never throws, it just produces a thinner journal row).
 */
describe('diffTariffPolicySnapshots — §5a item 2.11', () => {
  it('reports the cabinet AND the changed mechanic, and stays silent where nothing changed', () => {
    const before = {
      systemAccessPolicy: {
        graceDays: 14,
        readOnlyDays: 7,
        notifications: [],
        terminalState: 'read_only',
      },
      mechanicAccessPolicies: {
        courses: { graceDays: 3, readOnlyDays: 3, notifications: [], terminalState: 'disabled' },
        branding: { graceDays: 5, readOnlyDays: 0, notifications: [], terminalState: 'disabled' },
      },
    };
    const after = {
      systemAccessPolicy: {
        graceDays: 21,
        readOnlyDays: 7,
        notifications: [],
        terminalState: 'read_only',
      },
      mechanicAccessPolicies: {
        // courses: unchanged — must NOT appear in the diff.
        courses: { graceDays: 3, readOnlyDays: 3, notifications: [], terminalState: 'disabled' },
        branding: { graceDays: 5, readOnlyDays: 0, notifications: [], terminalState: 'read_only' },
      },
    };

    const entries = diffTariffPolicySnapshots(before, after);

    expect(entries).toEqual([
      { mechanic: null, label: 'Кабинет', before: before.systemAccessPolicy, after: after.systemAccessPolicy },
      {
        mechanic: 'branding',
        label: 'Брендирование',
        before: before.mechanicAccessPolicies.branding,
        after: after.mechanicAccessPolicies.branding,
      },
    ]);
  });
});
