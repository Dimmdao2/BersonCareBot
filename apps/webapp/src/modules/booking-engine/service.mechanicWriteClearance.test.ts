import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createBookingEngineService } from './service';
import type { BookingEngineCorePort } from './ports';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function buildCatalogService() {
  const createPhysicalBranchWithDefaultColor = vi.fn(async () => ({
    id: 'branch-1',
    organizationId: ORG_ID,
    title: 'Филиал',
    shortTitle: null,
    color: '#AABBCC',
    cityCode: 'spb',
    address: null,
    timezone: 'Europe/Moscow',
    isActive: true,
    sortOrder: 10,
  }));
  const port = {
    listBranches: vi.fn(async () => []),
    getBranch: vi.fn(async () => null),
    upsertBranch: vi.fn(),
    createPhysicalBranchWithDefaultColor,
    deactivateBranch: vi.fn(async () => true),
    listRooms: vi.fn(),
    getRoom: vi.fn(),
    upsertRoom: vi.fn(),
    deactivateRoom: vi.fn(),
    listSpecialists: vi.fn(),
    getSpecialist: vi.fn(),
    upsertSpecialist: vi.fn(),
    deactivateSpecialist: vi.fn(),
    setSpecialistLocation: vi.fn(),
    setSpecialistRoom: vi.fn(),
    listSpecialistRooms: vi.fn(),
    getDefaultOrganizationId: vi.fn(),
    getOrganization: vi.fn(),
    listOrganizations: vi.fn(),
    upsertOrganization: vi.fn(),
    listServices: vi.fn(),
    getService: vi.fn(),
    upsertService: vi.fn(),
    deactivateService: vi.fn(),
    upsertSpecialistServiceAvailability: vi.fn(),
    listSpecialistServiceAvailability: vi.fn(),
    deactivateSpecialistServiceAvailability: vi.fn(),
    upsertServiceLocationAvailability: vi.fn(),
    setSoloServiceLocationAvailability: vi.fn(),
    listServiceLocationAvailability: vi.fn(),
    getAppointment: vi.fn(),
    listAppointmentsByChainId: vi.fn(),
    getStatusBeforePackageCharge: vi.fn(),
    createAppointment: vi.fn(),
    createOnlineAppointmentsIfAvailable: vi.fn(),
    createManualPatientVisit: vi.fn(),
    createAppointmentChain: vi.fn(),
    transitionAppointmentStatus: vi.fn(),
    getSpecialistAppointmentReminderSettings: vi.fn(),
    updateSpecialistAppointmentReminderSettings: vi.fn(),
    setPatientAppointmentReminderPreset: vi.fn(),
    getPatientAppointmentReminderPreference: vi.fn(),
  } as unknown as BookingEngineCorePort;

  const service = createBookingEngineService(port, {
    assertWriteClearance: assertMechanicWriteClearance,
    getLocationPaletteSetting: async () => ({ physicalPalette: ['#AABBCC'], online: '#112233' }),
  });
  return { service, createPhysicalBranchWithDefaultColor };
}

describe('booking-engine catalog — 3.2 physical door (branches)', () => {
  it('refuses createPhysicalBranch when no branches mutation decision ran first', async () => {
    const { service, createPhysicalBranchWithDefaultColor } = buildCatalogService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        service.catalog.createPhysicalBranch({
          organizationId: ORG_ID,
          title: 'Филиал',
          cityCode: 'spb',
          isActive: true,
          sortOrder: 10,
        }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(createPhysicalBranchWithDefaultColor).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared branches for this continuation', async () => {
    const { service, createPhysicalBranchWithDefaultColor } = buildCatalogService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('branches');
      const branch = await service.catalog.createPhysicalBranch({
        organizationId: ORG_ID,
        title: 'Филиал',
        cityCode: 'spb',
        isActive: true,
        sortOrder: 10,
      });
      expect(branch.id).toBe('branch-1');
    });
    expect(createPhysicalBranchWithDefaultColor).toHaveBeenCalledOnce();
  });
});
