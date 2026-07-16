import type { DbPort } from '../../../kernel/contracts/index.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function listSchedulerReminderOrganizationIds(db: DbPort): Promise<string[]> {
  const result = await db.query<{ organization_id: string }>(
    'SELECT organization_id::text AS organization_id FROM app.list_scheduler_reminder_organization_ids()',
  );
  return result.rows.map((row) => {
    const organizationId = row.organization_id?.trim().toLowerCase();
    if (!organizationId || !UUID_RE.test(organizationId)) {
      throw new Error('Scheduler reminder organization discovery returned an invalid organization id');
    }
    return organizationId;
  });
}
