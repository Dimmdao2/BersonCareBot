import { describe, expect, it } from 'vitest';
import type { ReminderRuleRecord } from './reminders.js';
import {
  REMINDER_RULE_UPSERTED,
  REMINDER_OCCURRENCE_FINALIZED,
  REMINDER_DELIVERY_LOGGED,
  CONTENT_ACCESS_GRANTED,
} from './projectionEventTypes.js';
import type {
  ReminderRuleListItem,
  ReminderRuleDetail,
  ReminderOccurrenceHistoryItem,
  RemindersReadsPort,
} from './ports.js';

describe('Stage 7 reminder contracts', () => {
  it('exports projection event type constants', () => {
    expect(REMINDER_RULE_UPSERTED).toBe('reminder.rule.upserted');
    expect(REMINDER_OCCURRENCE_FINALIZED).toBe('reminder.occurrence.finalized');
    expect(REMINDER_DELIVERY_LOGGED).toBe('reminder.delivery.logged');
    expect(CONTENT_ACCESS_GRANTED).toBe('content.access.granted');
  });

  it('ReminderRuleListItem is compatible with ReminderRuleRecord (handler contract)', () => {
    const listItem: ReminderRuleListItem = {
      id: '1',
      userId: '42',
      category: 'exercise',
      isEnabled: true,
      scheduleType: 'daily',
      timezone: 'Europe/Moscow',
      intervalMinutes: 60,
      windowStartMinute: 0,
      windowEndMinute: 1440,
      daysMask: '1111111',
      contentMode: 'none',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const _asRecord: ReminderRuleRecord = listItem;
    expect(_asRecord.category).toBe('exercise');
  });

  it('ReminderRuleDetail is compatible with ReminderRuleRecord', () => {
    const detail: ReminderRuleDetail = {
      id: '2',
      userId: '43',
      category: 'water',
      isEnabled: false,
      scheduleType: 'twice_daily',
      timezone: 'UTC',
      intervalMinutes: 120,
      windowStartMinute: 0,
      windowEndMinute: 1440,
      daysMask: '0000011',
      contentMode: 'random_from_collection',
    };
    const _asRecord: ReminderRuleRecord = detail;
    expect(_asRecord.id).toBe('2');
  });

  it('ReminderOccurrenceHistoryItem has required shape', () => {
    const item: ReminderOccurrenceHistoryItem = {
      id: 'occ-1',
      ruleId: 'rule-1',
      status: 'sent',
      deliveryChannel: 'telegram',
      errorCode: null,
      occurredAt: '2026-01-01T12:00:00.000Z',
    };
    expect(item.status).toBe('sent');
    expect(['sent', 'failed']).toContain(item.status);
  });

  it('RemindersReadsPort has required methods', () => {
    const stub: RemindersReadsPort = {
      listRulesForUser: async () => [],
      getRuleForUserAndCategory: async () => null,
      listHistoryForUser: async () => [],
    };
    expect(stub.listRulesForUser).toBeDefined();
    expect(stub.getRuleForUserAndCategory).toBeDefined();
    expect(stub.listHistoryForUser).toBeDefined();
  });
});
