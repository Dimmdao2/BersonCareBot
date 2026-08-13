import { describe, expect, it } from 'vitest';
import { shouldApplyPhysicalBranchReactivationQuota } from './onlineLocation';

describe('physical branch reactivation quota', () => {
  it('does not charge the built-in Online location against physical branch stock', () => {
    expect(
      shouldApplyPhysicalBranchReactivationQuota({
        existingIsActive: false,
        nextIsActive: true,
        location: { title: 'Онлайн', cityCode: 'online' },
      }),
    ).toBe(false);
  });

  it('still checks stock when a physical branch is reactivated', () => {
    expect(
      shouldApplyPhysicalBranchReactivationQuota({
        existingIsActive: false,
        nextIsActive: true,
        location: { title: 'Клиника на Невском', cityCode: 'spb' },
      }),
    ).toBe(true);
  });
});
