/**
 * K7 — `validateNativePushTapRoute` is the client-side independent re-check before Next navigation
 * (`useNativePushLifecycle.ts` only calls `router.push` when this returns non-null). Named поломка:
 * a malicious/mismatched/external tap payload gets navigated in-app, letting a spoofed push jump into
 * the wrong surface (patient runtime opening a doctor-only route) or off-app (external/protocol-relative
 * URL executed as an in-app Next route) — dorogoy (cross-surface/open-redirect-shaped) and tikhiy (looks
 * like an ordinary notification tap, nothing errors).
 */
import { describe, expect, it } from 'vitest';
import { validateNativePushTapRoute } from './nativePushTapRoute';

function tap(overrides: Partial<{ pushSurface: string; notificationKind: string; route: string }> = {}) {
  return { pushSurface: 'therapygo', notificationKind: 'message', route: '/app/patient/chat', ...overrides };
}

describe('validateNativePushTapRoute — same-surface route accepted exactly once', () => {
  it('accepts a valid same-surface patient route for therapygo_android', () => {
    expect(validateNativePushTapRoute('therapygo_android', tap())).toBe('/app/patient/chat');
  });

  it.each(['/app/doctor/clients', '/app/settings/notifications', '/app/account'])(
    'accepts a valid same-surface staff route for therapysto_android: %s',
    (route) => {
      expect(
        validateNativePushTapRoute('therapysto_android', tap({ pushSurface: 'therapysto', route })),
      ).toBe(route);
    },
  );
});

describe('validateNativePushTapRoute — K7 rejected classes (no navigation)', () => {
  it('rejects a cross-surface tap: therapysto payload delivered to the therapygo runtime', () => {
    expect(
      validateNativePushTapRoute('therapygo_android', tap({ pushSurface: 'therapysto', route: '/app/doctor/clients' })),
    ).toBeNull();
  });

  it('rejects a cross-surface tap: therapygo payload delivered to the therapysto runtime', () => {
    expect(
      validateNativePushTapRoute('therapysto_android', tap({ pushSurface: 'therapygo', route: '/app/patient/chat' })),
    ).toBeNull();
  });

  it('rejects an admin route even with a matching surface label', () => {
    expect(
      validateNativePushTapRoute('therapysto_android', tap({ pushSurface: 'therapysto', route: '/app/admin/users' })),
    ).toBeNull();
  });

  it.each(['https://evil.tld/app/patient', 'http://therapygo.ru/app/patient'])(
    'rejects an absolute external URL: %s',
    (route) => {
      expect(validateNativePushTapRoute('therapygo_android', tap({ route }))).toBeNull();
    },
  );

  it('rejects a protocol-relative URL', () => {
    expect(validateNativePushTapRoute('therapygo_android', tap({ route: '//evil.tld/app/patient' }))).toBeNull();
  });

  it.each(['/app/patient/../doctor', '/app/patient/./x', '/app/patient/..'])(
    'rejects a route with a dot-segment: %s',
    (route) => {
      expect(validateNativePushTapRoute('therapygo_android', tap({ route }))).toBeNull();
    },
  );

  it.each(['/app/doctor', '/app/settings', '/app/patientish', '', 'app/patient', 'javascript:alert(1)'])(
    'rejects a malformed or out-of-surface route: %s',
    (route) => {
      expect(validateNativePushTapRoute('therapygo_android', tap({ route }))).toBeNull();
    },
  );

  it('rejects an unrecognized notificationKind', () => {
    expect(validateNativePushTapRoute('therapygo_android', tap({ notificationKind: 'promo' }))).toBeNull();
  });

  it('rejects an overlong route', () => {
    expect(validateNativePushTapRoute('therapygo_android', tap({ route: `/app/patient/${'a'.repeat(300)}` }))).toBeNull();
  });
});
