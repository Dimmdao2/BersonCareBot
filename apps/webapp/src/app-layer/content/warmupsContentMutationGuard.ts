import {
  entitlementMutationRefusalMessage,
  requireEntitlementForMutationAction,
  type EntitlementContext,
} from '@/app-layer/guards/requireEntitlement';

type ContentSectionPlacement = Readonly<{
  systemParentCode: string | null;
}>;

export function isWarmupsContentSection(
  section: ContentSectionPlacement | null | undefined,
): boolean {
  return section?.systemParentCode === 'warmups';
}

export async function warmupsContentMutationRefusal(
  context: EntitlementContext,
): Promise<string | null> {
  const entitlement = await requireEntitlementForMutationAction(context, 'warmups');
  return entitlement.ok ? null : entitlementMutationRefusalMessage('изменить контент разминок');
}
