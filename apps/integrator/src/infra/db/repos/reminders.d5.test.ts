import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { runWithOrganizationPrincipal } from '../../principal/organizationPrincipal.js';
import { reminderRules } from '../schema/integratorPublicProduct.js';
import { getEnabledReminderRules } from './reminders.js';

const organizationId = '11111111-1111-4111-8111-111111111111';

function canonicalRuleRow() {
  return {
    id: 'rule-canonical-1',
    user_id: 123,
    category: 'lfk',
    is_enabled: true,
    schedule_type: 'interval_window',
    timezone: 'Europe/Moscow',
    interval_minutes: 60,
    window_start_minute: 540,
    window_end_minute: 1080,
    days_mask: '1111111',
    content_mode: 'none',
    linked_object_type: 'rehab_program',
    linked_object_id: 'program-1',
    custom_title: null,
    custom_text: null,
    schedule_data: null,
    reminder_intent: 'exercises',
    quiet_hours_start_minute: null,
    quiet_hours_end_minute: null,
    notification_topic_code: 'rehab',
    organization_id: organizationId,
    created_at: '2026-08-02T09:00:00.000Z',
    updated_at: '2026-08-02T10:00:00.000Z',
  };
}

describe('D5 canonical scheduler rule read', () => {
  it('fails closed without an organization principal', async () => {
    await expect(getEnabledReminderRules({} as DbPort)).rejects.toThrow(
      'requires an exact organization principal',
    );
  });

  it('returns a bot-linked rule from the canonical public-table Drizzle model for its principal', async () => {
    const from = vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(async () => [canonicalRuleRow()]),
      })),
    }));
    const db = {
      integratorDrizzle: {
        select: vi.fn(() => ({ from })),
      },
    } as unknown as DbPort;

    const rules = await runWithOrganizationPrincipal(organizationId, () =>
      getEnabledReminderRules(db),
    );

    expect(from).toHaveBeenCalledWith(reminderRules);
    expect(rules).toEqual([
      expect.objectContaining({
        id: 'rule-canonical-1',
        userId: '123',
        organizationId,
        reminderIntent: 'exercises',
      }),
    ]);
  });
});
