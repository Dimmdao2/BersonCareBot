import { resolvePatientEnrollmentOrganizationId } from '@/app/api/booking/bookingTenant';
import {
  entitlementMutationRefusalMessage,
  entitlementMutationRefusalResponse,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { isContentPageInDailyWarmupBlock } from '@/modules/patient-home/todayConfig';
import { DEFAULT_WARMUPS_SECTION_SLUG } from '@/modules/patient-home/warmupsSection';
import type { ContentPagesPort } from '@/infra/repos/pgContentPages';
import { runWithMechanicWriteClearance } from '@/app-layer/entitlements/mechanicWriteClearance';

type Deps = {
  patientOrganization: Parameters<typeof resolvePatientEnrollmentOrganizationId>[0]['patientOrganization'];
  reminders: {
    listRulesByUser: (userId: string) => Promise<
      Array<{
        id: string;
        linkedObjectType: string | null;
        linkedObjectId: string | null;
      }>
    >;
  };
  patientHomeBlocks: Parameters<typeof isContentPageInDailyWarmupBlock>[1]['patientHomeBlocks'];
  contentPages: Parameters<typeof isContentPageInDailyWarmupBlock>[1]['contentPages'] &
    Pick<ContentPagesPort, 'getById'>;
  contentSections: Parameters<typeof isContentPageInDailyWarmupBlock>[1]['contentSections'];
  systemSettings: Parameters<typeof isContentPageInDailyWarmupBlock>[1]['systemSettings'];
};

type ReminderTarget = {
  linkedObjectType: string | null;
  linkedObjectId: string | null;
};

type MutationRunner = {
  ok: true;
  runMutation: <T>(mutation: () => T) => T;
};

const passthroughMutationRunner: MutationRunner = {
  ok: true,
  runMutation: <T>(mutation: () => T) => mutation(),
};

async function isWarmupReminderTarget(
  deps: Deps,
  target: ReminderTarget,
  organizationId: string,
): Promise<boolean> {
  const linkedObjectId = target.linkedObjectId?.trim() ?? '';
  if (!linkedObjectId) return false;
  if (target.linkedObjectType === 'content_section') {
    if (linkedObjectId === DEFAULT_WARMUPS_SECTION_SLUG || linkedObjectId === 'warmups') return true;
    const section = await deps.contentSections.getBySlug(linkedObjectId);
    return section?.systemParentCode === 'warmups';
  }
  if (target.linkedObjectType !== 'content_page') return false;
  const page = await deps.contentPages.getById(linkedObjectId, { organizationId });
  if (page) {
    const section = await deps.contentSections.getBySlug(page.section);
    if (section?.systemParentCode === 'warmups') return true;
  }
  return isContentPageInDailyWarmupBlock(linkedObjectId, deps, organizationId);
}

export async function requirePatientWarmupReminderMutation(
  deps: Deps,
  patientUserId: string,
  targetOrRule: ReminderTarget | { ruleId: string },
  action: string,
) {
  const tenant = await resolvePatientEnrollmentOrganizationId(
    { patientOrganization: deps.patientOrganization },
    patientUserId,
  );
  if (!tenant.ok) return tenant;

  const target =
    'ruleId' in targetOrRule
      ? (await deps.reminders.listRulesByUser(patientUserId)).find(
          (rule) => rule.id === targetOrRule.ruleId,
        )
      : targetOrRule;
  if (!target || !(await isWarmupReminderTarget(deps, target, tenant.organizationId))) {
    return passthroughMutationRunner;
  }

  const entitlement = await requireEntitlementForMutation(
    { organizationId: tenant.organizationId },
    'warmups',
  );
  return entitlement.ok
    ? {
        ok: true as const,
        runMutation: <T>(mutation: () => T) =>
          runWithMechanicWriteClearance('warmups', mutation),
      }
    : {
        ok: false as const,
        message: entitlementMutationRefusalMessage(action),
        response: entitlementMutationRefusalResponse('warmups', action),
      };
}
