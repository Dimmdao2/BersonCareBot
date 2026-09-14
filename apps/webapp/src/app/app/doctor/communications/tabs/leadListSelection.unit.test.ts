import { describe, expect, it } from 'vitest';
import { resolveVisibleLeadSelection } from './leadListSelection';

function lead(id: string, status: 'new' | 'rejected') {
  return {
    id,
    status,
  };
}

describe('resolveVisibleLeadSelection', () => {
  it('hides an actionable detail when its lead is excluded by a status filter', () => {
    const newLead = lead('new-lead', 'new');
    const rejectedLead = lead('rejected-lead', 'rejected');

    const selection = resolveVisibleLeadSelection([newLead, rejectedLead], 'rejected', newLead.id);

    expect(selection.filteredLeads).toEqual([rejectedLead]);
    expect(selection.selectedLead).toBeNull();
  });
});
