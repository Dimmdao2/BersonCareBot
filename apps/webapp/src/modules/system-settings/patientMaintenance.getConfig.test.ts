import { beforeEach, describe, expect, it, vi } from 'vitest';

const getConfigBoolMock = vi.fn();
const getConfigValueMock = vi.fn();

vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPatientRuntimeBool: (...args: unknown[]) => getConfigBoolMock(...args),
  getPatientRuntimeValue: (...args: unknown[]) => getConfigValueMock(...args),
}));

import {
  getPatientMaintenanceConfig,
  resolvePatientMaintenanceOrganizationId,
} from './patientMaintenance';

describe('getPatientMaintenanceConfig', () => {
  beforeEach(() => {
    getConfigBoolMock.mockReset();
    getConfigValueMock.mockReset();
  });

  it('reads only enabled flag when maintenance is off', async () => {
    getConfigBoolMock.mockResolvedValue(false);
    const cfg = await getPatientMaintenanceConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.message.length).toBeGreaterThan(0);
    expect(cfg.bookingUrl).toBeNull();
    expect(getConfigBoolMock).toHaveBeenCalledWith('patient_app_maintenance_enabled');
    expect(getConfigValueMock).not.toHaveBeenCalled();
  });

  it('reads message and booking in parallel when maintenance is on', async () => {
    getConfigBoolMock.mockResolvedValue(true);
    getConfigValueMock
      .mockResolvedValueOnce('Custom text')
      .mockResolvedValueOnce('https://booking.example.com');
    const cfg = await getPatientMaintenanceConfig('00000000-0000-4000-8000-000000000001');
    expect(cfg.enabled).toBe(true);
    expect(cfg.message).toBe('Custom text');
    expect(cfg.bookingUrl).toBe('https://booking.example.com');
    expect(getConfigValueMock).toHaveBeenCalledTimes(2);
    expect(getConfigValueMock).toHaveBeenCalledWith(
      'patient_booking_url',
      '00000000-0000-4000-8000-000000000001',
    );
  });

  it('no_enrollment omits booking CTA and does not read a global booking URL', async () => {
    const organizationId = await resolvePatientMaintenanceOrganizationId(
      {
        resolveActiveOrganizationForPatient: vi
          .fn()
          .mockResolvedValue({ ok: false, reason: 'no_active_enrollment' }),
      },
      'patient-1',
    );
    getConfigBoolMock.mockResolvedValue(true);
    getConfigValueMock.mockResolvedValue('Custom text');

    const cfg = await getPatientMaintenanceConfig(organizationId);

    expect(cfg.bookingUrl).toBeNull();
    expect(getConfigValueMock).not.toHaveBeenCalledWith('patient_booking_url', expect.anything());
  });

  it('organization_selection_required omits booking CTA and does not choose the first organization', async () => {
    const organizationId = await resolvePatientMaintenanceOrganizationId(
      {
        resolveActiveOrganizationForPatient: vi.fn().mockResolvedValue({
          ok: false,
          reason: 'organization_selection_required',
          organizationIds: ['org-a', 'org-b'],
        }),
      },
      'patient-1',
    );
    getConfigBoolMock.mockResolvedValue(true);
    getConfigValueMock.mockResolvedValue('Custom text');

    const cfg = await getPatientMaintenanceConfig(organizationId);

    expect(cfg.bookingUrl).toBeNull();
    expect(getConfigValueMock).not.toHaveBeenCalledWith('patient_booking_url', expect.anything());
  });
});
