import {
  entitlementMutationRefusalMessage,
  requireEntitlementForMutationAction,
  type EntitlementContext,
} from '@/app-layer/guards/requireEntitlement';
import type { OrgMechanic } from '@/modules/org-entitlements/types';

type ContentSectionPlacement = Readonly<{
  systemParentCode: string | null;
}>;

export function isWarmupsContentSection(
  section: ContentSectionPlacement | null | undefined,
): boolean {
  return section?.systemParentCode === 'warmups';
}

export function contentMechanicForSection(
  section: ContentSectionPlacement | null | undefined,
): Extract<OrgMechanic, 'cms_pages' | 'warmups'> {
  return isWarmupsContentSection(section) ? 'warmups' : 'cms_pages';
}

export async function warmupsContentMutationRefusal(
  context: EntitlementContext,
): Promise<string | null> {
  const entitlement = await requireEntitlementForMutationAction(context, 'warmups');
  return entitlement.ok ? null : entitlementMutationRefusalMessage('изменить контент разминок');
}
