import { cache } from 'react';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import type { CabinetAccessResolution } from '@/modules/org-entitlements/types';

/**
 * Request-local memo for cabinet ladder reads. Layout and workspace guards must share
 * one resolver per organization on the same RSC request — not a cross-request cache.
 */
export const resolveCabinetAccessRequestLocal = cache(
  async (organizationId: string): Promise<CabinetAccessResolution> => {
    return buildAppDeps().orgEntitlements.resolveCabinetAccess(organizationId);
  },
);
