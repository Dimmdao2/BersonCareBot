import { describe, expect, it } from 'vitest';
import {
  lockedBindingUserIdFromAccessorRow,
  preSessionChannelBindingSessionRowSchema,
} from './identityPhoneRowSchemas';

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

describe('preSessionChannelBindingSessionRowSchema', () => {
  it('accepts the PostgreSQL UUID-shaped ids used by the live DEV role matrix', () => {
    expect(
      preSessionChannelBindingSessionRowSchema.parse({
        user_id: '00000000-0000-0000-0000-000000000001',
        display_name: 'Demo Client',
        role: 'client',
        phone_normalized: '+79990000001',
        channel_code: 'telegram',
        external_id: '111111111',
      }),
    ).toMatchObject({ user_id: '00000000-0000-0000-0000-000000000001' });
  });
});
