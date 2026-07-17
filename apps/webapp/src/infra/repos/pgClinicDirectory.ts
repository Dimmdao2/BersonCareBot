import { runWebappPgText } from "@/infra/db/runWebappSql";
import type { ClinicDirectoryPort } from "@/modules/clinic-directory/ports";

/**
 * Calls the narrow SECURITY DEFINER bootstrap resolver `app.resolve_public_organization_by_slug`
 * (`deploy/postgres/public-clinic-slug-bootstrap-resolver.sql`). The bootstrap principal has no
 * direct SELECT on `clinic_public_directory_entries` / `be_organizations`; this function is the
 * only permitted path from an unauthenticated slug to an organization id.
 */
export function createPgClinicDirectoryPort(): ClinicDirectoryPort {
  return {
    async resolveOrganizationIdBySlug(slug) {
      const result = await runWebappPgText<{ organization_id: string | null }>(
        `SELECT app.resolve_public_organization_by_slug($1::text)::text AS organization_id`,
        [slug],
      );
      return result.rows[0]?.organization_id ?? null;
    },
  };
}
