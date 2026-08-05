import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createPatientHomeBlocksService } from './service';
import type { PatientHomeBlocksPort } from './ports';

function buildService() {
  const setBlockVisibility = vi.fn(async () => undefined);
  const port: PatientHomeBlocksPort = {
    listBlocksWithItems: vi.fn(async () => []),
    setBlockVisibility,
    setBlockIcon: vi.fn(async () => undefined),
    reorderBlocks: vi.fn(async () => undefined),
    addItem: vi.fn(async () => 'item-1'),
    updateItem: vi.fn(async () => undefined),
    deleteItem: vi.fn(async () => undefined),
    getItemById: vi.fn(async () => null),
    reorderItems: vi.fn(async () => undefined),
    retargetContentPageItems: vi.fn(async () => undefined),
  };
  const service = createPatientHomeBlocksService({
    port,
    contentPages: { listAll: async () => [], getBySlug: async () => null },
    contentSections: { listAll: async () => [], getBySlug: async () => null },
    courses: {
      listCoursesForDoctor: async () => [],
      getCourseForDoctor: async () => null,
    },
    assertWriteClearance: assertMechanicWriteClearance,
  });
  return { service, setBlockVisibility };
}

describe('patient-home blocks service — 3.2 physical door (patient_home_today)', () => {
  it('refuses setBlockVisibility when no patient_home_today mutation decision ran first', async () => {
    const { service, setBlockVisibility } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(service.setBlockVisibility('courses', true)).rejects.toBeInstanceOf(
        MechanicWriteClearanceRequiredError,
      );
    });
    expect(setBlockVisibility).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared patient_home_today for this continuation', async () => {
    const { service, setBlockVisibility } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('patient_home_today');
      await service.setBlockVisibility('booking', true);
    });
    expect(setBlockVisibility).toHaveBeenCalledOnce();
  });
});
