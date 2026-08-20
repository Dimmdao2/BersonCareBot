import { getCurrentDbPrincipalOrganizationId } from '@bersoncare/db-principal';
import { runWithOrganizationPrincipal } from '../../principal/organizationPrincipal.js';

/**
 * The sole principal-selection chokepoint for direct writes to `public.*`.
 *
 * SQL remains in the bounded repository named by the operation; this port owns the
 * decision to re-enter the already-resolved organization principal before that SQL runs.
 */
export type DirectPublicWriteOperation =
  | 'identity-upsert'
  | 'phone-bind'
  | 'admin-audit-write'
  | 'reminder-rule-upsert'
  | 'reminder-occurrence-finalize'
  | 'reminder-delivery-append'
  | 'content-access-grant-upsert'
  | 'support-delivery-append';

const principalStrategy: Readonly<Record<DirectPublicWriteOperation, 'organization'>> = {
  'identity-upsert': 'organization',
  'phone-bind': 'organization',
  'admin-audit-write': 'organization',
  'reminder-rule-upsert': 'organization',
  'reminder-occurrence-finalize': 'organization',
  'reminder-delivery-append': 'organization',
  'content-access-grant-upsert': 'organization',
  'support-delivery-append': 'organization',
};

export function writeDirectPublic<T>(
  operation: DirectPublicWriteOperation,
  write: () => Promise<T>,
  options: { organizationId?: string | null } = {},
): Promise<T> {
  const strategy = principalStrategy[operation];
  const organizationId = options.organizationId ?? getCurrentDbPrincipalOrganizationId();
  return strategy === 'organization' && organizationId
    ? runWithOrganizationPrincipal(organizationId, write)
    : write();
}
