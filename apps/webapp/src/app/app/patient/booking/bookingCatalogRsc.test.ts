import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveActiveOrganizationForPatientMock = vi.hoisted(() => vi.fn());
const listBranchesMock = vi.hoisted(() => vi.fn());
const getBranchMock = vi.hoisted(() => vi.fn());
const listSpecialistsMock = vi.hoisted(() => vi.fn());
const listServicesMock = vi.hoisted(() => vi.fn());
const listServiceLocationAvailabilityMock = vi.hoisted(() => vi.fn());
const listSpecialistServiceAvailabilityMock = vi.hoisted(() => vi.fn());
const resolveCanonicalInPersonContextMock = vi.hoisted(() => vi.fn());
const getMaxConsecutiveSlotHoursMock = vi.hoisted(() => vi.fn());
const getAppDisplayTimeZoneMock = vi.hoisted(() => vi.fn());
const withExplicitOrganizationPrincipalMock = vi.hoisted(() =>
  vi.fn(async (_ctx: { organizationId: string; source: string }, fn: () => Promise<unknown>) =>
    fn(),
  ),
);

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    patientOrganization: {
      resolveActiveOrganizationForPatient: resolveActiveOrganizationForPatientMock,
    },
    bookingEngine: {
      catalog: {
        listBranches: listBranchesMock,
        getBranch: getBranchMock,
        listSpecialists: listSpecialistsMock,
      },
      services: {
        listServices: listServicesMock,
        listServiceLocationAvailability: listServiceLocationAvailabilityMock,
        listSpecialistServiceAvailability: listSpecialistServiceAvailabilityMock,
      },
    },
    bookingScheduling: {
      resolveCanonicalInPersonContext: resolveCanonicalInPersonContextMock,
      getMaxConsecutiveSlotHours: getMaxConsecutiveSlotHoursMock,
    },
  }),
}));

vi.mock('@/app-layer/principal/withOrganizationPrincipal', () => ({
  withExplicitOrganizationPrincipal: withExplicitOrganizationPrincipalMock,
}));

vi.mock('@/modules/system-settings/appDisplayTimezone', () => ({
  getAppDisplayTimeZone: getAppDisplayTimeZoneMock,
}));

import {
  loadBookingCitiesForPatientRsc,
  loadInPersonSlotContextForPatientRsc,
  loadInPersonServicesForCityRsc,
  loadPatientBookingDisplaySettingsRsc,
} from './bookingCatalogRsc';

const ORGANIZATION_ID = '22222222-2222-4222-8222-222222222222';
const PATIENT_ID = '11111111-1111-4111-8111-111111111111';

describe('patient booking catalog RSC principal boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveActiveOrganizationForPatientMock.mockResolvedValue({
      ok: true,
      organizationId: ORGANIZATION_ID,
    });
    getAppDisplayTimeZoneMock.mockResolvedValue('Europe/Moscow');
    getMaxConsecutiveSlotHoursMock.mockResolvedValue(3);
  });

  it('reads cities under the organization resolved from the patient enrollment', async () => {
    listBranchesMock.mockResolvedValue([
      {
        id: '33333333-3333-4333-8333-333333333333',
        organizationId: ORGANIZATION_ID,
        cityCode: 'moscow',
        title: 'Москва',
        isActive: true,
        sortOrder: 0,
      },
    ]);

    await expect(loadBookingCitiesForPatientRsc(PATIENT_ID)).resolves.toMatchObject({
      ok: true,
      cities: [{ code: 'moscow', title: 'Москва' }],
    });
    expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledOnce();
    expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, source: 'app/patient/booking:load-cities' },
      expect.any(Function),
    );
    expect(listBranchesMock).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it('fails closed without an active patient enrollment and never enters an organization principal', async () => {
    resolveActiveOrganizationForPatientMock.mockResolvedValue({
      ok: false,
      reason: 'no_active_enrollment',
    });

    await expect(loadBookingCitiesForPatientRsc(PATIENT_ID)).resolves.toEqual({
      ok: false,
      error: 'catalog_unavailable',
      cities: [],
      onlineLocation: null,
    });
    expect(withExplicitOrganizationPrincipalMock).not.toHaveBeenCalled();
    expect(listBranchesMock).not.toHaveBeenCalled();
  });

  it('carries an enabled clinic-wide Online service into the authenticated booking wizard service step', async () => {
    const onlineBranchId = '33333333-3333-4333-8333-333333333339';
    const serviceId = '44444444-4444-4444-8444-444444444449';
    const specialistId = '55555555-5555-4555-8555-555555555559';
    listBranchesMock.mockResolvedValue([
      {
        id: onlineBranchId,
        organizationId: ORGANIZATION_ID,
        cityCode: 'online',
        title: 'Онлайн',
        shortTitle: 'Онлайн',
        isActive: true,
        sortOrder: 0,
      },
    ]);
    getBranchMock.mockResolvedValue({
      id: onlineBranchId,
      organizationId: ORGANIZATION_ID,
      cityCode: 'online',
      title: 'Онлайн',
      isActive: true,
    });
    listServicesMock.mockResolvedValue([
      {
        id: serviceId,
        organizationId: ORGANIZATION_ID,
        title: 'Онлайн-консультация',
        description: null,
        durationMinutes: 60,
        priceMinor: 100000,
        isActive: true,
        publicWidgetVisible: true,
        adminManualOnly: false,
      },
    ]);
    listSpecialistsMock.mockResolvedValue([
      { id: specialistId, organizationId: ORGANIZATION_ID, isActive: true },
    ]);
    listSpecialistServiceAvailabilityMock.mockResolvedValue([
      {
        id: 'ssa-online',
        organizationId: ORGANIZATION_ID,
        specialistId,
        serviceId,
        branchId: onlineBranchId,
        isActive: true,
      },
    ]);

    await expect(loadBookingCitiesForPatientRsc(PATIENT_ID)).resolves.toEqual({
      ok: true,
      cities: [],
      onlineLocation: { id: onlineBranchId, cityCode: 'online', title: 'Онлайн' },
    });
    await expect(loadInPersonServicesForCityRsc('online', PATIENT_ID)).resolves.toEqual({
      ok: true,
      branchId: onlineBranchId,
      branchTitle: 'Онлайн',
      cityCode: 'online',
      services: [
        {
          id: serviceId,
          title: 'Онлайн-консультация',
          description: null,
          durationMinutes: 60,
          priceMinor: 100000,
        },
      ],
    });
    expect(listBranchesMock).toHaveBeenCalledWith(ORGANIZATION_ID);
    expect(listServicesMock).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it('keeps the service catalog read inside the resolved organization principal', async () => {
    const branchId = '33333333-3333-4333-8333-333333333333';
    listBranchesMock.mockResolvedValue([
      {
        id: branchId,
        organizationId: ORGANIZATION_ID,
        cityCode: 'moscow',
        title: 'Москва',
        isActive: true,
        sortOrder: 0,
      },
    ]);
    getBranchMock.mockResolvedValue({
      id: branchId,
      organizationId: ORGANIZATION_ID,
      cityCode: 'moscow',
      title: 'Москва',
      isActive: true,
    });
    listServicesMock.mockResolvedValue([]);
    listServiceLocationAvailabilityMock.mockResolvedValue([]);
    listSpecialistServiceAvailabilityMock.mockResolvedValue([]);
    listSpecialistsMock.mockResolvedValue([]);

    await expect(loadInPersonServicesForCityRsc('moscow', PATIENT_ID)).resolves.toMatchObject({
      ok: true,
      branchId,
      cityCode: 'moscow',
      services: [],
    });
    expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledOnce();
    expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, source: 'app/patient/booking:load-services' },
      expect.any(Function),
    );
    expect(getBranchMock).toHaveBeenCalledWith(branchId);
    expect(listServicesMock).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it('loads authenticated booking display settings only inside the patient organization principal', async () => {
    await expect(loadPatientBookingDisplaySettingsRsc(PATIENT_ID)).resolves.toEqual({
      ok: true,
      organizationId: ORGANIZATION_ID,
      appDisplayTimeZone: 'Europe/Moscow',
    });
    expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, source: 'app/patient/booking:load-display-settings' },
      expect.any(Function),
    );
    expect(getAppDisplayTimeZoneMock).toHaveBeenCalledOnce();
  });

  it('resolves and validates the full slot context inside the active patient organization', async () => {
    const branchId = '33333333-3333-4333-8333-333333333333';
    const serviceId = '44444444-4444-4444-8444-444444444444';
    const specialistId = '66666666-6666-4666-8666-666666666666';
    listBranchesMock.mockResolvedValue([]);
    getBranchMock.mockResolvedValue({
      id: branchId,
      organizationId: ORGANIZATION_ID,
      cityCode: 'moscow',
      title: 'Москва, центр',
      isActive: true,
    });
    listServicesMock.mockResolvedValue([
      {
        id: serviceId,
        organizationId: ORGANIZATION_ID,
        title: 'Приём',
        description: null,
        durationMinutes: 60,
        priceMinor: 500000,
        isActive: true,
        publicWidgetVisible: true,
        adminManualOnly: false,
      },
    ]);
    listServiceLocationAvailabilityMock.mockResolvedValue([
      { id: 'l1', organizationId: ORGANIZATION_ID, serviceId, branchId, isActive: true },
    ]);
    listSpecialistServiceAvailabilityMock.mockResolvedValue([
      {
        id: '55555555-5555-4555-8555-555555555555',
        organizationId: ORGANIZATION_ID,
        specialistId,
        serviceId,
        branchId,
        isActive: true,
      },
    ]);
    listSpecialistsMock.mockResolvedValue([
      { id: specialistId, organizationId: ORGANIZATION_ID, isActive: true },
    ]);
    resolveCanonicalInPersonContextMock.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      branchId,
      serviceId,
      specialistId,
      roomId: null,
      branchServiceId: '55555555-5555-4555-8555-555555555555',
      legacyBranchServiceId: null,
      durationMinutes: 75,
      bufferAfterMinutes: 0,
      branchTimezone: 'Europe/Moscow',
    });

    await expect(
      loadInPersonSlotContextForPatientRsc({ platformUserId: PATIENT_ID, branchId, serviceId }),
    ).resolves.toMatchObject({
      ok: true,
      organizationId: ORGANIZATION_ID,
      branchId,
      serviceId,
      cityCode: 'moscow',
      serviceTitle: 'Приём',
      durationMinutes: 75,
      priceMinor: 500000,
      maxConsecutiveSlotHours: 3,
      appDisplayTimeZone: 'Europe/Moscow',
    });
    expect(withExplicitOrganizationPrincipalMock).toHaveBeenCalledWith(
      { organizationId: ORGANIZATION_ID, source: 'app/patient/booking:load-slot-context' },
      expect.any(Function),
    );
    expect(resolveCanonicalInPersonContextMock).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      branchId,
      serviceId,
    });
    expect(getMaxConsecutiveSlotHoursMock).toHaveBeenCalledWith(ORGANIZATION_ID);
  });

  it('fails closed when the canonical mapping disagrees with the requested branch/service ids', async () => {
    const branchId = '33333333-3333-4333-8333-333333333333';
    const serviceId = '44444444-4444-4444-8444-444444444444';
    const specialistId = '66666666-6666-4666-8666-666666666666';
    listBranchesMock.mockResolvedValue([]);
    getBranchMock.mockResolvedValue({
      id: branchId,
      organizationId: ORGANIZATION_ID,
      cityCode: 'moscow',
      title: 'Москва, центр',
      isActive: true,
    });
    listServicesMock.mockResolvedValue([
      {
        id: serviceId,
        organizationId: ORGANIZATION_ID,
        title: 'Приём',
        description: null,
        durationMinutes: 60,
        priceMinor: 500000,
        isActive: true,
        publicWidgetVisible: true,
        adminManualOnly: false,
      },
    ]);
    listServiceLocationAvailabilityMock.mockResolvedValue([
      { id: 'l1', organizationId: ORGANIZATION_ID, serviceId, branchId, isActive: true },
    ]);
    listSpecialistServiceAvailabilityMock.mockResolvedValue([
      {
        id: '55555555-5555-4555-8555-555555555555',
        organizationId: ORGANIZATION_ID,
        specialistId,
        serviceId,
        branchId,
        isActive: true,
      },
    ]);
    listSpecialistsMock.mockResolvedValue([
      { id: specialistId, organizationId: ORGANIZATION_ID, isActive: true },
    ]);
    // Canonical mapping resolves a DIFFERENT branch than the one the patient selected —
    // the RSC must fail closed instead of trusting the query-string branch/service ids.
    resolveCanonicalInPersonContextMock.mockResolvedValue({
      organizationId: ORGANIZATION_ID,
      branchId: '88888888-8888-4888-8888-888888888888',
      serviceId,
      specialistId,
      roomId: null,
      branchServiceId: '55555555-5555-4555-8555-555555555555',
      legacyBranchServiceId: null,
      durationMinutes: 75,
      bufferAfterMinutes: 0,
      branchTimezone: 'Europe/Moscow',
    });

    await expect(
      loadInPersonSlotContextForPatientRsc({ platformUserId: PATIENT_ID, branchId, serviceId }),
    ).resolves.toEqual({ ok: false, error: 'invalid_selection' });
    expect(getAppDisplayTimeZoneMock).not.toHaveBeenCalled();
  });
});
