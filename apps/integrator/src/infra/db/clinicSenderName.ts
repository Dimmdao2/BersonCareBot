/**
 * The clinic's own name, for the ONE sender-selection seam.
 *
 * Owner 30.07 (`OWNER_PRODUCT_RULES.md` §30.1): «уведомления о новом сообщении и о записи на прием
 * тоже шлем - с указанием к какому специалисту», and essential delivery must go out even when the
 * clinic has no credentials of its own — «просто делаем это от лица платформы». A message the
 * COMMON bot delivers on behalf of a clinic therefore has to name that clinic; a message the
 * clinic's OWN bot delivers already carries the clinic identity in the sender itself.
 *
 * Read through the existing Drizzle port under the active organization principal. RLS narrows the
 * relation to `id = app.current_org_id()`, so this can only ever return the tenant's own row.
 */
import { and, eq } from 'drizzle-orm';
import type { DbPort } from '../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from './drizzle.js';
import { beOrganizations } from './schema/integratorPublicProduct.js';
import { getCurrentOrganizationPrincipalId } from '../principal/organizationPrincipal.js';

const MAX_LABEL_LENGTH = 120;

export function createClinicSenderNameResolver(db: DbPort) {
  return async function resolveClinicSenderName(): Promise<string | null> {
    const organizationId = getCurrentOrganizationPrincipalId()?.trim() ?? '';
    if (!organizationId) return null;
    const rows = await getIntegratorDrizzleSession(db)
      .select({ title: beOrganizations.title })
      .from(beOrganizations)
      .where(and(eq(beOrganizations.id, organizationId), eq(beOrganizations.isActive, true)))
      .limit(1);
    const title = rows[0]?.title?.trim() ?? '';
    if (!title) return null;
    return title.length > MAX_LABEL_LENGTH ? title.slice(0, MAX_LABEL_LENGTH).trim() : title;
  };
}
