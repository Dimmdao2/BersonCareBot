import { sql } from 'drizzle-orm';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import type { DomainHealthCandidatePort, DomainHealthTarget } from '@/modules/domain-health/ports';

const LIST_CUSTOM_DOMAIN_HOSTNAMES_ROOT = 'app.list_configured_custom_domain_hostnames()';

function parseHostnames(value: unknown): DomainHealthTarget[] {
  if (!Array.isArray(value)) {
    throw new Error('custom_domain_hostname_list_invalid');
  }
  return value.map((hostname) => {
    if (typeof hostname !== 'string' || hostname.length === 0) {
      throw new Error('custom_domain_hostname_list_invalid');
    }
    return { hostname };
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
      return parseHostnames(result.rows[0]?.hostnames ?? []);
    },
  };
}
