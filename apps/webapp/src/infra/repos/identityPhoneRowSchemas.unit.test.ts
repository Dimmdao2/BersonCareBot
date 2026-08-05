import { describe, expect, it } from 'vitest';
import { lockedBindingUserIdFromAccessorRow } from './identityPhoneRowSchemas';

describe('lockedBindingUserIdFromAccessorRow', () => {
  it('treats null user_id as miss (scalar accessor always returns one row)', () => {
    expect(lockedBindingUserIdFromAccessorRow({ user_id: null })).toBeNull();
  });

  it('returns the locked owner when a binding exists', () => {
    expect(
      lockedBindingUserIdFromAccessorRow({
        user_id: '11111111-1111-4111-8111-111111111111',
      }),
    ).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('rejects a missing row shape instead of treating it as a hit', () => {
    expect(() => lockedBindingUserIdFromAccessorRow(undefined)).toThrow(/binding_lock/);
    expect(() => lockedBindingUserIdFromAccessorRow({})).toThrow(/binding_lock/);
  });
});
