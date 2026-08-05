import { describe, expect, it } from 'vitest';
import { diffTariffPolicySnapshots } from './policyHistoryDiff';

/**
 * §5a item 2.11 — a policy edit must leave a readable "было → стало" record for the system ladder
 * (#1069 T1, owner 05.08: one ladder subject only).
 */
describe('diffTariffPolicySnapshots — §5a item 2.11', () => {
  it('reports the cabinet when system access changed, and stays silent where nothing changed', () => {
    const before = {
      systemAccessPolicy: {
        graceDays: 14,
        readOnlyDays: 7,
        notifications: [],
        terminalState: 'read_only',
      },
      mechanicAccessPolicies: {
        courses: { graceDays: 3, readOnlyDays: 3, notifications: [], terminalState: 'disabled' },
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
        courses: { graceDays: 99, readOnlyDays: 99, notifications: [], terminalState: 'disabled' },
      },
    };

    const entries = diffTariffPolicySnapshots(before, after);

    expect(entries).toEqual([
      { mechanic: null, label: 'Кабинет', before: before.systemAccessPolicy, after: after.systemAccessPolicy },
    ]);
  });
});
