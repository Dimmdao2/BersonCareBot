import type { CabinetAccessResolution } from '@/modules/org-entitlements/types';

/** Only the terminal cabinet block closes product entry; billing recovery is handled by callers. */
export function isCabinetEntryBlocked(access: CabinetAccessResolution): boolean {
  return access.state === 'disabled' || access.state === 'unconfigured';
}
