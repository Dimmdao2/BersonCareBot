import { describe, expect, it, vi } from 'vitest';
import {
  MechanicWriteClearanceRequiredError,
  assertMechanicWriteClearance,
  enterWithMechanicWriteClearance,
  runWithoutMechanicWriteClearance,
} from '@/app-layer/entitlements/mechanicWriteClearance';
import { createTreatmentProgramInstanceService } from './instance-service';
import type { TreatmentProgramInstancePort } from './ports';
import type { TreatmentProgramService } from './service';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const TEMPLATE_ID = '44444444-4444-4444-8444-444444444444';

function buildService() {
  const listInstancesWhere = vi.fn(async () => []);
  const instances = {
    listInstancesWhere,
  } as unknown as TreatmentProgramInstancePort;
  const templates = {
    getTemplate: vi.fn(async () => ({ status: 'published' })),
  } as unknown as TreatmentProgramService;
  const service = createTreatmentProgramInstanceService({
    instances,
    templates,
    snapshots: {} as never,
    itemRefs: {} as never,
    media: {} as never,
    getDefaultPromoTemplateId: async () => TEMPLATE_ID,
    assertWriteClearance: assertMechanicWriteClearance,
  });
  return { service, listInstancesWhere };
}

describe('treatment-program instance service — 3.2 physical door (promo)', () => {
  it('refuses refreshActivePromoProgramsFromDefaultTemplate when no promo mutation decision ran first', async () => {
    const { service, listInstancesWhere } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        service.refreshActivePromoProgramsFromDefaultTemplate({
          actorUserId: 'user-1',
          organizationId: ORG_ID,
        }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
    expect(listInstancesWhere).not.toHaveBeenCalled();
  });

  it('proceeds once the mutation guard cleared promo for this continuation', async () => {
    const { service, listInstancesWhere } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      enterWithMechanicWriteClearance('promo');
      const result = await service.refreshActivePromoProgramsFromDefaultTemplate({
        actorUserId: 'user-1',
        organizationId: ORG_ID,
      });
      expect(result.templateId).toBe(TEMPLATE_ID);
    });
    expect(listInstancesWhere).toHaveBeenCalledOnce();
  });

  it('refuses ensureDefaultPromoProgramForPatient when no promo mutation decision ran first', async () => {
    const { service } = buildService();
    await runWithoutMechanicWriteClearance(async () => {
      await expect(
        service.ensureDefaultPromoProgramForPatient({ patientUserId: '55555555-5555-4555-8555-555555555555' }),
      ).rejects.toBeInstanceOf(MechanicWriteClearanceRequiredError);
    });
  });
});
