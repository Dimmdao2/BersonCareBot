import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPatientWebPushStatus } from './patientWebPushApi';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('patient web-push access refusal', () => {
  it('navigates to the server-provided email escape route on a 403 requirement', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { assign } });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          ok: false,
          error: 'patient_email_required',
          redirectTo: '/app/patient/bind-email?next=%2Fapp%2Fpatient%2Finstall',
        }),
      }),
    );

    const result = await fetchPatientWebPushStatus();

    expect(assign).toHaveBeenCalledWith('/app/patient/bind-email?next=%2Fapp%2Fpatient%2Finstall');
    expect(result).toMatchObject({ ok: false, vapidConfigured: false });
  });
});
