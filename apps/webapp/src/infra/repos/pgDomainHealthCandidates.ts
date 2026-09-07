import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type { DomainHealthCandidatePort, DomainHealthTarget } from '@/modules/domain-health/ports';

const LIST_CUSTOM_DOMAIN_HOSTNAMES_ROOT = 'app.list_configured_custom_domain_hostnames()';

function parseTargets(value: unknown): DomainHealthTarget[] {
  if (!Array.isArray(value)) {
    throw new Error('custom_domain_hostname_list_invalid');
  }
  return value.map((candidate) => {
    // Retain compatibility with the pre-binding root while every managed database is migrated.
    if (typeof candidate === 'string' && candidate.length > 0) return { hostname: candidate };
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
      throw new Error('custom_domain_hostname_list_invalid');
    }
    const row = candidate as Record<string, unknown>;
    if (
      typeof row.organizationId !== 'string' ||
      typeof row.baseDomain !== 'string' ||
      typeof row.hostname !== 'string' ||
      (row.placement !== 'apex' && row.placement !== 'subdomain') ||
      !['pending', 'dns_ready', 'active', 'failed', 'suspended'].includes(String(row.status)) ||
      typeof row.organizationActive !== 'boolean' ||
      typeof row.hasPublishedBrand !== 'boolean'
    ) {
      throw new Error('custom_domain_hostname_list_invalid');
    }
    return {
      organizationId: row.organizationId,
      baseDomain: row.baseDomain,
      hostname: row.hostname,
      placement: row.placement,
      status: row.status as NonNullable<DomainHealthTarget['status']>,
      organizationActive: row.organizationActive,
      hasPublishedBrand: row.hasPublishedBrand,
    };
  });
}

/** Cross-tenant monitoring sees only the public hostnames returned by one declared DB root. */
export function createPgDomainHealthCandidatesPort(): DomainHealthCandidatePort {
  return {
    async listConfiguredTargets() {
      const result = await runWebappNamedRoot<{ hostnames: unknown }>(
        getWebappSqlDb(),
        LIST_CUSTOM_DOMAIN_HOSTNAMES_ROOT,
        [],
        sql`SELECT app.list_configured_custom_domain_hostnames() AS hostnames`,
      );
      return parseTargets(result.rows[0]?.hostnames ?? []);
    },
  };
}
