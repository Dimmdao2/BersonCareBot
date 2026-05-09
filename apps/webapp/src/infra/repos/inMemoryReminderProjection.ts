import type {
  ReminderProjectionPort,
  ReminderRuleListItem,
  ReminderOccurrenceHistoryItem,
} from "./pgReminderProjection";
import { buildReminderDeepLink } from "@/modules/reminders/buildReminderDeepLink";

const rulesByIntegratorRuleId = new Map<string, ReminderRuleListItem>();
const occurrenceHistory: Array<{
  integratorOccurrenceId: string;
  integratorRuleId: string;
  integratorUserId: string;
  category: string;
  status: "sent" | "failed";
  deliveryChannel: string | null;
  errorCode: string | null;
  occurredAt: string;
}> = [];
const deliveryEventsByIntegratorLogId = new Map<
  string,
  {
    integratorDeliveryLogId: string;
    integratorOccurrenceId: string;
    integratorRuleId: string;
    integratorUserId: string;
    channel: string;
    status: string;
    errorCode: string | null;
    payloadJson: Record<string, unknown>;
    createdAt: string;
  }
>();
const contentGrantsByIntegratorGrantId = new Map<string, unknown>();

export const inMemoryReminderProjectionPort: ReminderProjectionPort = {
  async upsertRuleFromProjection(params) {
    const item: ReminderRuleListItem = {
      id: params.integratorRuleId,
      userId: params.integratorUserId,
      category: params.category,
      isEnabled: params.isEnabled,
      scheduleType: params.scheduleType,
      timezone: params.timezone,
      intervalMinutes: params.intervalMinutes,
      windowStartMinute: params.windowStartMinute,
      windowEndMinute: params.windowEndMinute,
      daysMask: params.daysMask,
      contentMode: params.contentMode,
      linkedObjectType: null,
      linkedObjectId: null,
      customTitle: null,
      customText: null,
      deepLink: buildReminderDeepLink({ linkedObjectType: null, linkedObjectId: null }),
      scheduleData: null,
      reminderIntent: null,
      displayTitle: null,
      displayDescription: null,
      quietHoursStartMinute: null,
      quietHoursEndMinute: null,
      updatedAt: params.updatedAt,
    };
    rulesByIntegratorRuleId.set(params.integratorRuleId, item);
  },

  async appendFinalizedOccurrenceFromProjection(params) {
    const existing = occurrenceHistory.some(
      (o) => o.integratorOccurrenceId === params.integratorOccurrenceId
    );
    if (existing) return;
    occurrenceHistory.push({
      integratorOccurrenceId: params.integratorOccurrenceId,
      integratorRuleId: params.integratorRuleId,
      integratorUserId: params.integratorUserId,
      category: params.category,
      status: params.status,
      deliveryChannel: params.deliveryChannel ?? null,
      errorCode: params.errorCode ?? null,
      occurredAt: params.occurredAt,
    });
  },

  async appendDeliveryEventFromProjection(params) {
    if (deliveryEventsByIntegratorLogId.has(params.integratorDeliveryLogId)) return;
    deliveryEventsByIntegratorLogId.set(params.integratorDeliveryLogId, {
      integratorDeliveryLogId: params.integratorDeliveryLogId,
      integratorOccurrenceId: params.integratorOccurrenceId,
      integratorRuleId: params.integratorRuleId,
      integratorUserId: params.integratorUserId,
      channel: params.channel,
      status: params.status,
      errorCode: params.errorCode ?? null,
      payloadJson: params.payloadJson ?? {},
      createdAt: params.createdAt,
    });
  },

  async upsertContentAccessGrantFromProjection(params) {
    contentGrantsByIntegratorGrantId.set(params.integratorGrantId, params);
  },

  async listRulesByIntegratorUserId(integratorUserId: string) {
    return Array.from(rulesByIntegratorRuleId.values())
      .filter((r) => r.userId === integratorUserId)
      .sort((a, b) => a.category.localeCompare(b.category));
  },

  async getRuleByIntegratorUserIdAndCategory(integratorUserId: string, category: string) {
    return (
      Array.from(rulesByIntegratorRuleId.values()).find(
        (x) => x.userId === integratorUserId && x.category === category
      ) ?? null
    );
  },

  async listHistoryByIntegratorUserId(integratorUserId: string, limit = 50) {
    const items = occurrenceHistory
      .filter((o) => o.integratorUserId === integratorUserId)
      .sort((a, b) => (b.occurredAt < a.occurredAt ? -1 : 1))
      .slice(0, limit)
      .map(
        (o): ReminderOccurrenceHistoryItem => ({
          id: o.integratorOccurrenceId,
          ruleId: o.integratorRuleId,
          status: o.status,
          deliveryChannel: o.deliveryChannel,
          errorCode: o.errorCode,
          occurredAt: o.occurredAt,
        })
      );
    return items;
  },

  async getUnseenCount(_platformUserId: string) {
    return 0;
  },

  async getStats(_platformUserId: string, _days: number) {
    return { total: 0, seen: 0, unseen: 0, failed: 0 };
  },

  async markSeen(_platformUserId: string, _occurrenceIds: string[]) {
    // no-op in memory
  },

  async markAllSeen(_platformUserId: string) {
    // no-op in memory
  },
};
