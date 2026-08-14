import { describe, expect, it } from 'vitest';
import {
  lockedBindingUserIdFromAccessorRow,
  preSessionChannelBindingSessionRowSchema,
  sessionIdentityContactsFromRows,
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

describe('sessionIdentityContactsFromRows', () => {
  it('keeps every phone/e-mail and preserves primary and confirmation state', () => {
    expect(
      sessionIdentityContactsFromRows([
        {
          contact_kind: 'phone',
          value_normalized: '+79990000001',
          is_primary: true,
          confirmed_at: new Date('2026-08-14T10:00:00.000Z'),
          source_origin: 'phone_history',
        },
        {
          contact_kind: 'email',
          value_normalized: 'primary@example.test',
          is_primary: true,
          confirmed_at: '2026-08-14T11:00:00.000Z',
          source_origin: 'oauth_binding',
        },
        {
          contact_kind: 'email',
          value_normalized: 'pending@example.test',
          is_primary: false,
          confirmed_at: null,
          source_origin: 'platform_users',
        },
      ]),
    ).toEqual([
      {
        kind: 'phone',
        value: '+79990000001',
        isPrimary: true,
        confirmedAt: '2026-08-14T10:00:00.000Z',
        sourceOrigin: 'phone_history',
      },
      {
        kind: 'email',
        value: 'primary@example.test',
        isPrimary: true,
        confirmedAt: '2026-08-14T11:00:00.000Z',
        sourceOrigin: 'oauth_binding',
      },
      {
        kind: 'email',
        value: 'pending@example.test',
        isPrimary: false,
        sourceOrigin: 'platform_users',
      },
    ]);
  });

  it('rejects an unknown contact source instead of weakening the session shape', () => {
    expect(() =>
      sessionIdentityContactsFromRows([
        {
          contact_kind: 'email',
          value_normalized: 'user@example.test',
          is_primary: true,
          confirmed_at: null,
          source_origin: 'unknown',
        },
      ]),
    ).toThrow(/session_identity_contact/);
  });
});
