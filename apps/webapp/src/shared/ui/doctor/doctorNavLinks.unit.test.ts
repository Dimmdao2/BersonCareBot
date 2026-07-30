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

  it('hides only the promo entry when the promo mechanic is off', () => {
    const capabilities = ['account.self', 'clinical.workspace'] as const;
    const disabledItems = getDoctorMenuItems({
      capabilities,
      promoEnabled: false,
    });
    const enabledItems = getDoctorMenuItems({
      capabilities,
      promoEnabled: true,
    });
    const libraryItems = (items: ReturnType<typeof getDoctorMenuItems>) =>
      items.find((item) => item.id === 'library')?.items?.map((item) => item.id) ?? [];

    expect(libraryItems(disabledItems)).not.toContain('treatment-program-promo');
    expect(libraryItems(enabledItems)).toContain('treatment-program-promo');
    expect(libraryItems(disabledItems)).toContain('treatment-program-templates');
  });

  it('removes the courses section when the shared visibility adapter disables it', () => {
    const capabilities = ['account.self', 'clinical.workspace'] as const;
    const disabledIds = getDoctorMenuItems({
      capabilities,
      coursesEnabled: false,
    }).map((item) => item.id);
    const enabledIds = getDoctorMenuItems({
      capabilities,
      coursesEnabled: true,
    }).map((item) => item.id);

    expect(disabledIds).not.toContain('courses');
    expect(enabledIds).toContain('courses');
  });
});
