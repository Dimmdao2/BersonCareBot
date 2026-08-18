import { describe, expect, it } from 'vitest';
import { runWithDbPatientPrincipal, runWithDbStaffPrincipal } from '@bersoncare/db-principal';
import {
  mechanicAccessMemoKey,
  withRequestLocalMechanicAccess,
} from '@/app-layer/entitlements/requestLocalMechanicAccess';
import type { OrgEntitlementsPort } from '@/modules/org-entitlements/ports';
import type { MechanicAccessResolution, OrgMechanic } from '@/modules/org-entitlements/types';

const ORG_A = 'a0000000-0000-4000-8000-0000000000a1';
const ORG_B = 'b0000000-0000-4000-8000-0000000000b2';
const USER_A = 'c0000000-0000-4000-8000-0000000000c3';
const USER_B = 'd0000000-0000-4000-8000-0000000000d4';

function portRecording(calls: string[]): OrgEntitlementsPort {
  return {
    async resolveMechanicAccess(
      organizationId: string,
      mechanic: OrgMechanic,
    ): Promise<MechanicAccessResolution> {
      calls.push(`${organizationId}/${mechanic}`);
      return { mechanic, state: 'full_access', policySource: 'mechanic', warning: null };
    },
  } as unknown as OrgEntitlementsPort;
}

/**
 * Что ловит: ключ памяти, который перестал различать арендатора или принципала. Такой ключ отдал бы
 * ответ одной клиники другой (или ответ сотрудника — пациенту), а страница выглядела бы исправной:
 * право просто оказалось бы чужим. Сама длительность памяти принадлежит `react.cache` и равна
 * одному серверному запросу; здесь проверяется разделённость, за которую отвечает этот файл.
 */
describe('request-local mechanic access memo key', () => {
  it('separates organizations under one principal', async () => {
    await runWithDbStaffPrincipal({ organizationId: ORG_A, platformUserId: USER_A }, async () => {
      expect(mechanicAccessMemoKey(ORG_A, 'branding')).not.toEqual(
        mechanicAccessMemoKey(ORG_B, 'branding'),
      );
    });
  });

  it('separates mechanics', async () => {
    await runWithDbStaffPrincipal({ organizationId: ORG_A, platformUserId: USER_A }, async () => {
      expect(mechanicAccessMemoKey(ORG_A, 'branding')).not.toEqual(
        mechanicAccessMemoKey(ORG_A, 'payments'),
      );
    });
  });

  it('separates principals asking about the same organization and mechanic', async () => {
    const staffKey = await runWithDbStaffPrincipal(
      { organizationId: ORG_A, platformUserId: USER_A },
      async () => mechanicAccessMemoKey(ORG_A, 'branding'),
    );
    const otherStaffKey = await runWithDbStaffPrincipal(
      { organizationId: ORG_A, platformUserId: USER_B },
      async () => mechanicAccessMemoKey(ORG_A, 'branding'),
    );
    const patientKey = await runWithDbPatientPrincipal(
      { organizationId: ORG_A, platformUserId: USER_A },
      async () => mechanicAccessMemoKey(ORG_A, 'branding'),
    );
    expect(new Set([staffKey, otherStaffKey, patientKey]).size).toBe(3);
  });

  it('keeps asking the port and never answers from a previous request', async () => {
    const calls: string[] = [];
    const port = withRequestLocalMechanicAccess(portRecording(calls));
    await runWithDbStaffPrincipal({ organizationId: ORG_A, platformUserId: USER_A }, async () => {
      await port.resolveMechanicAccess(ORG_A, 'branding');
    });
    await runWithDbStaffPrincipal({ organizationId: ORG_A, platformUserId: USER_A }, async () => {
      await port.resolveMechanicAccess(ORG_A, 'branding');
    });
    expect(calls).toEqual([`${ORG_A}/branding`, `${ORG_A}/branding`]);
  });
});
