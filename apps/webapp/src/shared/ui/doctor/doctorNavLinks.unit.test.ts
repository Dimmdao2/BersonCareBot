import { describe, expect, it } from 'vitest';
import { getDoctorMenuItems } from './doctorNavLinks';

describe('doctor navigation schedule access', () => {
  it('shows schedule, but no other clinical links, to an organization manager', () => {
    const items = getDoctorMenuItems({
      capabilities: ['account.self', 'organization.management'],
    });
    const ids = items.map((item) => item.id);

    expect(ids).toContain('schedule');
    expect(ids).toContain('settings');
    expect(ids).not.toContain('patients');
    expect(ids).not.toContain('communications');
  });
});
