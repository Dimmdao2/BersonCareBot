import type { Action, ActionResult, DomainContext } from '../../../contracts/index.js';
import type { DueReminderOccurrence, ReminderCategory, ReminderRuleRecord } from '../../../contracts/reminders.js';
import type { ExecutorDeps } from '../helpers.js';
import {
  asNumber,
  asNumericString,
  asString,
  nowIso,
  persistWrites,
  readExternalActorId,
} from '../helpers.js';
import {
  buildDefaultReminderRule,
  cycleReminderPreset,
  detectReminderPreset,
  reminderPresetConfig,
} from '../../reminders/policy.js';
import { REMINDER_BY_CATEGORY } from '../templateKeys.js';

export async function handleReminders(
  action: Action,
  ctx: DomainContext,
  deps: ExecutorDeps,
): Promise<ActionResult> {
  if (action.type === 'reminders.rules.get') {
    if (!deps.readPort) return { actionId: action.id, status: 'skipped', error: 'reminders.rules.get: no readPort' };
    const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
    const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
    if (!channelUserId) return { actionId: action.id, status: 'failed', error: 'reminders.rules.get: missing channelUserId' };
    const link = await deps.readPort.readDb<{ userId?: string } | null>({
      type: 'user.byIdentity',
      params: { resource, externalId: channelUserId },
    });
    const userId = link && typeof link === 'object' && typeof link.userId === 'string' ? link.userId : null;
    if (!userId) return { actionId: action.id, status: 'success', values: { reminderRules: [] } };
    const rules = await deps.readPort.readDb<ReminderRuleRecord[]>({
      type: 'reminders.rules.forUser',
      params: { userId },
    });
    const list = Array.isArray(rules) ? rules : [];
    return { actionId: action.id, status: 'success', values: { reminderRules: list, reminderUserId: userId } };
  }

  if (action.type === 'reminders.rule.toggle') {
    if (!deps.readPort || !deps.writePort) return { actionId: action.id, status: 'skipped', error: 'reminders.rule.toggle: missing port' };
    let userId = asString(action.params.userId);
    if (!userId) {
      const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
      const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
      if (!channelUserId) return { actionId: action.id, status: 'failed', error: 'reminders.rule.toggle: missing userId or channelUserId' };
      const link = await deps.readPort.readDb<{ userId?: string } | null>({
        type: 'user.byIdentity',
        params: { resource, externalId: channelUserId },
      });
      userId = link && typeof link === 'object' && typeof link.userId === 'string' ? link.userId : null;
    }
    const category = asString(action.params.category) as ReminderCategory | null;
    if (!userId || !category) return { actionId: action.id, status: 'failed', error: 'reminders.rule.toggle: missing userId or category' };
    const existing = await deps.readPort.readDb<ReminderRuleRecord | null>({
      type: 'reminders.rule.forUserAndCategory',
      params: { userId, category },
    });
    const ruleId = existing?.id ?? `reminder:${userId}:${category}`;
    const nextEnabled = existing ? !existing.isEnabled : true;
    const record: ReminderRuleRecord = existing ?? buildDefaultReminderRule({ id: ruleId, userId, category });
    const writes = [{
      type: 'reminders.rule.upsert' as const,
      params: {
        id: ruleId,
        userId,
        category,
        isEnabled: nextEnabled,
        scheduleType: record.scheduleType,
        timezone: record.timezone,
        intervalMinutes: record.intervalMinutes,
        windowStartMinute: record.windowStartMinute,
        windowEndMinute: record.windowEndMinute,
        daysMask: record.daysMask,
        contentMode: record.contentMode,
      },
    }];
    await persistWrites(deps.writePort, writes);
    return { actionId: action.id, status: 'success', writes, values: { reminderRule: { ...record, isEnabled: nextEnabled } } };
  }

  if (action.type === 'reminders.rule.cyclePreset') {
    if (!deps.readPort || !deps.writePort) return { actionId: action.id, status: 'skipped', error: 'reminders.rule.cyclePreset: missing port' };
    let userId = asString(action.params.userId);
    if (!userId) {
      const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
      const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
      if (!channelUserId) return { actionId: action.id, status: 'failed', error: 'reminders.rule.cyclePreset: missing userId or channelUserId' };
      const link = await deps.readPort.readDb<{ userId?: string } | null>({
        type: 'user.byIdentity',
        params: { resource, externalId: channelUserId },
      });
      userId = link && typeof link === 'object' && typeof link.userId === 'string' ? link.userId : null;
    }
    const category = asString(action.params.category) as ReminderCategory | null;
    if (!userId || !category) return { actionId: action.id, status: 'failed', error: 'reminders.rule.cyclePreset: missing userId or category' };
    const existing = await deps.readPort.readDb<ReminderRuleRecord | null>({
      type: 'reminders.rule.forUserAndCategory',
      params: { userId, category },
    });
    const currentPreset = existing ? detectReminderPreset(existing) : null;
    const nextPreset = cycleReminderPreset(currentPreset);
    const config = reminderPresetConfig(nextPreset);
    const ruleId = existing?.id ?? `reminder:${userId}:${category}`;
    const record: ReminderRuleRecord = existing ?? buildDefaultReminderRule({ id: ruleId, userId, category });
    const writes = [{
      type: 'reminders.rule.upsert' as const,
      params: {
        id: ruleId,
        userId,
        category,
        isEnabled: record.isEnabled,
        scheduleType: record.scheduleType,
        timezone: record.timezone,
        intervalMinutes: config.intervalMinutes,
        windowStartMinute: config.windowStartMinute,
        windowEndMinute: config.windowEndMinute,
        daysMask: record.daysMask,
        contentMode: record.contentMode,
      },
    }];
    await persistWrites(deps.writePort, writes);
    return { actionId: action.id, status: 'success', writes, values: { reminderPreset: nextPreset } };
  }

  if (action.type === 'reminders.dispatchDue') {
    if (!deps.readPort || !deps.writePort) return { actionId: action.id, status: 'skipped', error: 'reminders.dispatchDue: missing port' };
    const dueNowIso = asString(action.params.nowIso) ?? nowIso(ctx);
    const limit = asNumber(action.params.limit) ?? 50;
    const dueList = await deps.readPort.readDb<DueReminderOccurrence[]>({
      type: 'reminders.occurrences.due',
      params: { nowIso: dueNowIso, limit: Math.max(1, Math.min(limit, 100)) },
    });
    const items = Array.isArray(dueList) ? dueList : [];
    const writes: import('../../../contracts/index.js').DbWriteMutation[] = [];
    const intents: import('../../../contracts/index.js').OutgoingIntent[] = [];
    for (const occ of items) {
      writes.push({
        type: 'reminders.occurrence.markQueued',
        params: { occurrenceId: occ.id, deliveryJobId: null },
      });
      const templateKey = REMINDER_BY_CATEGORY[occ.category] ?? 'telegram:reminder.exercise';
      const text = deps.templatePort
        ? (await deps.templatePort.renderTemplate({
          source: 'telegram',
          templateId: templateKey.replace(/^telegram:/, ''),
          vars: {},
          audience: 'user',
        })).text
        : 'Пора подвигаться';
      intents.push({
        type: 'message.send',
        meta: {
          eventId: `${ctx.event.meta.eventId}:reminder:${occ.id}`,
          occurredAt: dueNowIso,
          source: 'scheduler',
          userId: occ.userId,
        },
        payload: {
          recipient: { chatId: occ.chatId },
          message: { text },
          delivery: { channels: ['telegram'], maxAttempts: 1 },
        },
      });
    }
    await persistWrites(deps.writePort, writes);
    return { actionId: action.id, status: 'success', writes, intents };
  }

  return { actionId: action.id, status: 'skipped', error: 'REMINDERS_HANDLER_UNKNOWN_TYPE' };
}
