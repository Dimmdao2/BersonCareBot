/**
 * Single-Host TEST bug fix, acceptance oracle.
 *
 * `apps/webapp/src/shared/lib/surface/requestSurface.ts`'s `isSharedStaffAndPatientHost` branch
 * checks the staff-host pattern before the patient-host pattern, so on the transitional
 * single-Host TEST deployment (staff and patient share one Host) a patient request can resolve to
 * the STAFF surface. `isAuthChannelEnabled` reads its toggle key from the resolved surface, so
 * a patient-only route that trusted that Host-derived resolution would silently read the staff
 * channel policy instead of the patient one — closing Telegram/MAX login for patients whenever
 * staff has it off, without the owner ever touching a patient setting.
 *
 * The fix (2026-08-26) is not a second resolver: patient-only messenger-bind/channel-link
 * routes now pass the existing `surface` override argument to `isAuthChannelEnabled(channel,
 * 'patient')` explicitly, instead of relying on the ambient Host-derived resolution. This oracle
 * proves that override wins unconditionally — even while the ambient resolved-surface header
 * claims `staff` (the exact single-Host misclassification) — and that the explicit call never
 * consults Host-derived resolution (`next/headers`) at all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getPublicRuntimeBool: vi.fn<(key: string) => Promise<boolean>>(),
  headers: vi.fn(),
}));

vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPublicRuntimeBool: fakes.getPublicRuntimeBool,
}));
vi.mock('next/headers', () => ({ headers: fakes.headers }));

const { isAuthChannelEnabled } = await import('./authChannelPolicy');
const { RESOLVED_SURFACE_HEADER, serializeResolvedSurface } = await import(
  '@/shared/lib/surface/requestSurface'
);

/** Same shape single-Host TEST would hand a patient request that misclassified as staff. */
const STAFF_MISCLASSIFIED_HEADERS = () =>
  new Headers({
    [RESOLVED_SURFACE_HEADER]: serializeResolvedSurface({
      surface: 'staff',
      publicOrigin: 'https://test.bersoncare.ru',
      authPolicy: { availableMethods: ['password', 'email_code'], enabledMethods: ['password'] },
    }),
  });

describe('single-Host misclassification cannot leak into an explicit-surface auth-channel check', () => {
  beforeEach(() => {
    fakes.getPublicRuntimeBool.mockReset();
    fakes.headers.mockReset();
  });

  it('without an explicit surface, the ambient (possibly misclassified) Host resolution decides the key', async () => {
    fakes.headers.mockResolvedValue(STAFF_MISCLASSIFIED_HEADERS());
    fakes.getPublicRuntimeBool.mockResolvedValue(true);

    await isAuthChannelEnabled('telegram');

    expect(fakes.getPublicRuntimeBool).toHaveBeenCalledWith(
      'auth_surface_staff_telegram_enabled',
      'public_auth_config',
    );
  });

  it("the patient messenger-bind route's explicit surface='patient' overrides the misclassified Host resolution", async () => {
    fakes.headers.mockResolvedValue(STAFF_MISCLASSIFIED_HEADERS());
    fakes.getPublicRuntimeBool.mockResolvedValue(true);

    await isAuthChannelEnabled('telegram', 'patient');

    expect(fakes.getPublicRuntimeBool).toHaveBeenCalledWith(
      'auth_surface_patient_telegram_enabled',
      'public_auth_config',
    );
    // The explicit surface short-circuits before Host resolution is ever consulted — the fix does
    // not depend on `next/headers` agreeing, so a still-misclassifying resolver cannot regress it.
    expect(fakes.headers).not.toHaveBeenCalled();
  });

  it('max channel: explicit patient surface also overrides the same misclassified Host resolution', async () => {
    fakes.headers.mockResolvedValue(STAFF_MISCLASSIFIED_HEADERS());
    fakes.getPublicRuntimeBool.mockResolvedValue(true);

    await isAuthChannelEnabled('max', 'patient');

    expect(fakes.getPublicRuntimeBool).toHaveBeenCalledWith(
      'auth_surface_patient_max_enabled',
      'public_auth_config',
    );
    expect(fakes.headers).not.toHaveBeenCalled();
  });
});
