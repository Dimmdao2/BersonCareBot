/**
 * Canonical CMS-page snapshot usage expression.
 *
 * Raw SQL belongs in infra. Keep storefront usage on the
 * exact SECURITY DEFINER recount as the database trigger, with no cache or mutable counter that
 * can drift. EXECUTE is limited to the platform-operations DB principal; clinic roles cannot ask
 * it for an arbitrary organization's count.
 */
export const CMS_PAGES_USAGE_SQL = 'app.cms_pages_snapshot_usage($1::uuid)::int';
