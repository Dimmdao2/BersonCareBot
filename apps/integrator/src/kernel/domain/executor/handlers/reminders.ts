import type { Action, ActionResult, DomainContext } from '../../../contracts/index.js';
import type { DueReminderOccurrence, ReminderCategory, ReminderRuleRecord } from '../../../contracts/reminders.js';
import type { ExecutorDeps } from '../helpers.js';
import {
  asNumber,
  asNumericString,
  asString,
  buildIntentMeta,
  nowIso,
  persistWrites,
  readExternalActorId,
  readIncoming,
  readIncomingText,
} from '../helpers.js';
import { createDbPort } from '../../../../infra/db/client.js';
import { getAppDisplayTimezone } from '../../../../config/appTimezone.js';
import {
  buildDefaultReminderRule,
  cycleReminderPreset,
  detectReminderPreset,
  reminderPresetConfig,
} from '../../reminders/policy.js';
import { buildPatientReminderDeepLink } from '../../reminders/buildPatientReminderDeepLink.js';
import {
  buildReminderDispatchInlineKeyboard,
  buildReminderSkipReasonInlineKeyboard,
} from '../../reminders/reminderInlineKeyboard.js';
import { REMINDER_BY_CATEGORY } from '../templateKeys.js';

function escapeReminderHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const SKIP_PRESET_REASON: Record<string, string | null> = {
  pain: 'Боль / дискомфорт',
  time: 'Нет времени',
  fatigue: 'Плохо себя чувствую',
  none: null,
};

async function resolveIntegratorUserId(
  readPort: NonNullable<ExecutorDeps['readPort']>,
  channelUserId: string,
  resource: string,
): Promise<string | null> {
  const link = await readPort.readDb<{ userId?: string } | null>({
    type: 'user.byIdentity',
    params: { resource, externalId: channelUserId },
  });
  return link && typeof link.userId === 'string' ? link.userId : null;
}

async function assertOccurrenceOwnedByUser(
  readPort: NonNullable<ExecutorDeps['readPort']>,
  occurrenceId: string,
  userId: string,
): Promise<boolean> {
  const owner = await readPort.readDb<string | null>({
    type: 'reminders.occurrence.ownerUserId',
    params: { occurrenceId },
  });
  return owner === userId;
}

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
    let record: ReminderRuleRecord;
    if (existing) {
      record = existing;
    } else {
      const dbPort = createDbPort();
      const tz = await getAppDisplayTimezone(
        deps.dispatchPort
          ? { db: dbPort, dispatchPort: deps.dispatchPort }
          : { db: dbPort },
      );
      record = buildDefaultReminderRule({ id: ruleId, userId, category, timezone: tz });
    }
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
    let record: ReminderRuleRecord;
    if (existing) {
      record = existing;
    } else {
      const dbPort = createDbPort();
      const tz = await getAppDisplayTimezone(
        deps.dispatchPort
          ? { db: dbPort, dispatchPort: deps.dispatchPort }
          : { db: dbPort },
      );
      record = buildDefaultReminderRule({ id: ruleId, userId, category, timezone: tz });
    }
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

    const rulesCache = new Map<string, Map<string, ReminderRuleRecord>>();
    async function rulesForUser(userId: string): Promise<Map<string, ReminderRuleRecord>> {
      const hit = rulesCache.get(userId);
      if (hit) return hit;
      const rules = await deps.readPort!.readDb<ReminderRuleRecord[]>({
        type: 'reminders.rules.forUser',
        params: { userId },
      });
      const map = new Map<string, ReminderRuleRecord>();
      for (const r of Array.isArray(rules) ? rules : []) {
        map.set(r.id, r);
      }
      rulesCache.set(userId, map);
      return map;
    }

    for (const occ of items) {
      writes.push({
        type: 'reminders.occurrence.markQueued',
        params: { occurrenceId: occ.id, deliveryJobId: null },
      });

      const ruleMap = await rulesForUser(occ.userId);
      const rule = ruleMap.get(occ.ruleId);
      const categoryKey = REMINDER_BY_CATEGORY[occ.category] ?? 'telegram:reminder.exercise';
      const categoryTemplateId = categoryKey.replace(/^telegram:/, '').replace(/^max:/, '');
      let reminderTitle: string;
      if (rule?.customTitle?.trim()) {
        reminderTitle = rule.customTitle.trim();
      } else if (deps.templatePort) {
        reminderTitle = (
          await deps.templatePort.renderTemplate({
            source: 'telegram',
            templateId: categoryTemplateId,
            vars: {},
            audience: 'user',
          })
        ).text.trim();
      } else {
        reminderTitle = 'Напоминание';
      }
      const reminderBodyRaw = rule?.customText?.trim() ?? '';
      const reminderBody = reminderBodyRaw ? escapeReminderHtml(reminderBodyRaw) : '';
      const openUrl =
        (rule?.deepLink?.trim() && rule.deepLink.trim().length > 0
          ? rule.deepLink.trim()
          : buildPatientReminderDeepLink({
            linkedObjectType: rule?.linkedObjectType ?? null,
            linkedObjectId: rule?.linkedObjectId ?? null,
          })) || buildPatientReminderDeepLink({ linkedObjectType: null, linkedObjectId: null });

      const replyMarkup = buildReminderDispatchInlineKeyboard({
        openUrl,
        occurrenceId: occ.id,
      });

      type ChannelIdentity = { resource: string; externalId: string; chatId: number };
      const allIdentities = await deps.readPort.readDb<ChannelIdentity[]>({
        type: 'identities.allByUserId',
        params: { userId: occ.userId },
      });

      const channelsToSend: Array<{ channel: 'telegram' | 'max'; chatId: number; externalId: string }> = [];
      if (occ.chatId > 0) {
        channelsToSend.push({ channel: 'telegram', chatId: occ.chatId, externalId: String(occ.chatId) });
      }
      if (Array.isArray(allIdentities)) {
        for (const identity of allIdentities) {
          if (identity.resource === 'max' && identity.chatId > 0) {
            channelsToSend.push({ channel: 'max', chatId: identity.chatId, externalId: identity.externalId });
          }
        }
      }

      for (const { channel, chatId, externalId } of channelsToSend) {
        const text = deps.templatePort
          ? (
            await deps.templatePort.renderTemplate({
              source: channel,
              templateId: 'reminder.dispatch',
              vars: {
                reminderTitle: escapeReminderHtml(reminderTitle),
                reminderBody,
              },
              audience: 'user',
            })
          ).text
          : `${escapeReminderHtml(reminderTitle)}${reminderBody ? `\n\n${reminderBody}` : ''}`;
        const deliveryLogId = `rdl:${occ.id}:${channel}`;
        intents.push({
          type: 'message.send',
          meta: {
            eventId: `${ctx.event.meta.eventId}:reminder:${occ.id}:${channel}`,
            occurredAt: dueNowIso,
            source: channel,
            userId: occ.userId,
          },
          payload: {
            recipient: { chatId },
            message: { text },
            replyMarkup,
            parse_mode: 'HTML',
            delivery: { channels: [channel], maxAttempts: 1 },
          },
        });
        writes.push({
          type: 'reminders.delivery.log',
          params: {
            id: deliveryLogId,
            occurrenceId: occ.id,
            channel,
            status: 'success',
            payloadJson: { chatId: externalId, text },
          },
        });
      }
    }

    await persistWrites(deps.writePort, writes);
    return { actionId: action.id, status: 'success', writes, intents };
  }

  if (action.type === 'reminders.snooze.callback') {
    if (!deps.readPort || !deps.writePort) {
      return { actionId: action.id, status: 'skipped', error: 'reminders.snooze.callback: missing port' };
    }
    const occurrenceId = asString(action.params.occurrenceId);
    const mp = action.params.minutes;
    const minutesParsed = Number(
      typeof mp === 'number' && Number.isFinite(mp) ? mp : (typeof mp === 'string' ? mp.trim() : ''),
    );
    const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
    const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
    if (!occurrenceId || !channelUserId) {
      return { actionId: action.id, status: 'failed', error: 'reminders.snooze.callback: missing ids' };
    }
    const minutes =
      minutesParsed === 30 || minutesParsed === 60 || minutesParsed === 120 ? minutesParsed : null;
    if (minutes === null) return { actionId: action.id, status: 'failed', error: 'reminders.snooze.callback: bad minutes' };
    const userId = await resolveIntegratorUserId(deps.readPort, channelUserId, resource);
    if (!userId || !(await assertOccurrenceOwnedByUser(deps.readPort, occurrenceId, userId))) {
      return { actionId: action.id, status: 'failed', error: 'reminders.snooze.callback: forbidden' };
    }
    let plannedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
    if (deps.remindersWebappWritesPort) {
      const w = await deps.remindersWebappWritesPort.postOccurrenceSnooze({
        integratorUserId: userId,
        occurrenceId,
        minutes,
      });
      if (w.ok) plannedUntil = w.snoozedUntil;
    }
    const writes: import('../../../contracts/index.js').DbWriteMutation[] = [{
      type: 'reminders.occurrence.reschedulePlanned',
      params: { occurrenceId, plannedAt: plannedUntil },
    }];
    await persistWrites(deps.writePort, writes);
    const tplSource = resource === 'max' ? 'max' : 'telegram';
    const ack = deps.templatePort
      ? (await deps.templatePort.renderTemplate({
        source: tplSource,
        templateId: 'reminder.snoozeAck',
        vars: { minutes: String(minutes) },
        audience: 'user',
      })).text
      : `Напоминание отложено на ${minutes} мин.`;
    const chatId =
      asNumber(action.params.chatId)
      ?? asNumber(readIncoming(ctx).chatId);
    const src = resource === 'max' ? 'max' : 'telegram';
    const intents: import('../../../contracts/index.js').OutgoingIntent[] = [];
    if (chatId !== null) {
      intents.push({
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          message: { text: ack },
          delivery: { channels: [src], maxAttempts: 1 },
        },
      });
    }
    return { actionId: action.id, status: 'success', writes, intents };
  }

  if (action.type === 'reminders.skip.reasonPrompt') {
    if (!deps.readPort) return { actionId: action.id, status: 'skipped', error: 'reminders.skip.reasonPrompt: no readPort' };
    const occurrenceId = asString(action.params.occurrenceId);
    const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
    const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
    const chatId = asNumber(action.params.chatId) ?? asNumber(readIncoming(ctx).chatId);
    if (!occurrenceId || !channelUserId || chatId === null) {
      return { actionId: action.id, status: 'failed', error: 'reminders.skip.reasonPrompt: missing params' };
    }
    const userId = await resolveIntegratorUserId(deps.readPort, channelUserId, resource);
    if (!userId || !(await assertOccurrenceOwnedByUser(deps.readPort, occurrenceId, userId))) {
      return { actionId: action.id, status: 'failed', error: 'reminders.skip.reasonPrompt: forbidden' };
    }
    const tplSource = resource === 'max' ? 'max' : 'telegram';
    const title = deps.templatePort
      ? (await deps.templatePort.renderTemplate({
        source: tplSource,
        templateId: 'reminder.skip.promptTitle',
        vars: {},
        audience: 'user',
      })).text
      : 'Почему пропускаете?';
    const replyMarkup = buildReminderSkipReasonInlineKeyboard(occurrenceId);
    const src = resource === 'max' ? 'max' : 'telegram';
    return {
      actionId: action.id,
      status: 'success',
      intents: [{
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          message: { text: title },
          ...(replyMarkup.inline_keyboard.length > 0 ? { replyMarkup } : {}),
          delivery: { channels: [src], maxAttempts: 1 },
        },
      }],
    };
  }

  if (action.type === 'reminders.skip.applyPreset') {
    if (!deps.readPort || !deps.writePort) {
      return { actionId: action.id, status: 'skipped', error: 'reminders.skip.applyPreset: missing port' };
    }
    const occurrenceId = asString(action.params.occurrenceId);
    const reasonCode = asString(action.params.reasonCode);
    const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
    const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
    const chatId = asNumber(action.params.chatId) ?? asNumber(readIncoming(ctx).chatId);
    if (!occurrenceId || !reasonCode || !channelUserId || chatId === null) {
      return { actionId: action.id, status: 'failed', error: 'reminders.skip.applyPreset: missing params' };
    }
    const userId = await resolveIntegratorUserId(deps.readPort, channelUserId, resource);
    if (!userId || !(await assertOccurrenceOwnedByUser(deps.readPort, occurrenceId, userId))) {
      return { actionId: action.id, status: 'failed', error: 'reminders.skip.applyPreset: forbidden' };
    }

    if (reasonCode === 'other') {
      const writes: import('../../../contracts/index.js').DbWriteMutation[] = [{
        type: 'user.state.set',
        params: { channelUserId, state: `waiting_skip_reason:${occurrenceId}` },
      }];
      await persistWrites(deps.writePort, writes);
      const tplSourceOther = resource === 'max' ? 'max' : 'telegram';
      const prompt = deps.templatePort
        ? (await deps.templatePort.renderTemplate({
          source: tplSourceOther,
          templateId: 'reminder.skip.askOther',
          vars: {},
          audience: 'user',
        })).text
        : 'Кратко опишите причину (одним сообщением).';
      const src = resource === 'max' ? 'max' : 'telegram';
      return {
        actionId: action.id,
        status: 'success',
        writes,
        intents: [{
          type: 'message.send',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: { chatId },
            message: { text: prompt },
            delivery: { channels: [src], maxAttempts: 1 },
          },
        }],
        values: { conversationState: `waiting_skip_reason:${occurrenceId}` },
      };
    }

    const journalReason = SKIP_PRESET_REASON[reasonCode];
    if (journalReason === undefined && reasonCode !== 'none') {
      return { actionId: action.id, status: 'failed', error: 'reminders.skip.applyPreset: bad code' };
    }
    const reasonForApi = reasonCode === 'none' ? null : (journalReason ?? null);
    if (deps.remindersWebappWritesPort) {
      await deps.remindersWebappWritesPort.postOccurrenceSkip({
        integratorUserId: userId,
        occurrenceId,
        reason: reasonForApi,
      });
    }
    const writes: import('../../../contracts/index.js').DbWriteMutation[] = [
      { type: 'reminders.occurrence.markSkippedLocal', params: { occurrenceId } },
    ];
    await persistWrites(deps.writePort, writes);
    const tplSaved = resource === 'max' ? 'max' : 'telegram';
    const ack = deps.templatePort
      ? (await deps.templatePort.renderTemplate({
        source: tplSaved,
        templateId: 'reminder.skip.saved',
        vars: {},
        audience: 'user',
      })).text
      : 'Причина сохранена.';
    const src = resource === 'max' ? 'max' : 'telegram';
    return {
      actionId: action.id,
      status: 'success',
      writes,
      intents: [{
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          message: { text: ack },
          delivery: { channels: [src], maxAttempts: 1 },
        },
      }],
    };
  }

  if (action.type === 'reminders.skip.applyFreeText') {
    if (!deps.readPort || !deps.writePort) {
      return { actionId: action.id, status: 'skipped', error: 'reminders.skip.applyFreeText: missing port' };
    }
    const state = ctx.base.conversationState ?? '';
    const prefix = 'waiting_skip_reason:';
    if (!state.startsWith(prefix)) {
      return { actionId: action.id, status: 'skipped', error: 'reminders.skip.applyFreeText: wrong state' };
    }
    const occurrenceId = state.slice(prefix.length).trim();
    const text = (readIncomingText(ctx) ?? '').trim().slice(0, 500);
    const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
    const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
    const chatId = asNumber(action.params.chatId) ?? asNumber(readIncoming(ctx).chatId);
    if (!occurrenceId || !channelUserId || chatId === null) {
      return { actionId: action.id, status: 'failed', error: 'reminders.skip.applyFreeText: missing params' };
    }
    const userId = await resolveIntegratorUserId(deps.readPort, channelUserId, resource);
    if (!userId || !(await assertOccurrenceOwnedByUser(deps.readPort, occurrenceId, userId))) {
      return { actionId: action.id, status: 'failed', error: 'reminders.skip.applyFreeText: forbidden' };
    }
    if (deps.remindersWebappWritesPort) {
      await deps.remindersWebappWritesPort.postOccurrenceSkip({
        integratorUserId: userId,
        occurrenceId,
        reason: text.length > 0 ? text : null,
      });
    }
    const writes: import('../../../contracts/index.js').DbWriteMutation[] = [
      { type: 'user.state.set', params: { channelUserId, state: 'idle' } },
      { type: 'reminders.occurrence.markSkippedLocal', params: { occurrenceId } },
    ];
    await persistWrites(deps.writePort, writes);
    const resourceFt = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
    const tplFt = resourceFt === 'max' ? 'max' : 'telegram';
    const ack = deps.templatePort
      ? (await deps.templatePort.renderTemplate({
        source: tplFt,
        templateId: 'reminder.skip.saved',
        vars: {},
        audience: 'user',
      })).text
      : 'Причина сохранена.';
    const src = resourceFt === 'max' ? 'max' : 'telegram';
    return {
      actionId: action.id,
      status: 'success',
      writes,
      intents: [{
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          message: { text: ack },
          delivery: { channels: [src], maxAttempts: 1 },
        },
      }],
      values: { conversationState: 'idle' },
    };
  }

  return { actionId: action.id, status: 'skipped', error: 'REMINDERS_HANDLER_UNKNOWN_TYPE' };
}
