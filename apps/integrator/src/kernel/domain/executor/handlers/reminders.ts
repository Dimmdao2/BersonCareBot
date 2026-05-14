import type { Action, ActionResult, DomainContext } from '../../../contracts/index.js';
import type { DueReminderOccurrence, ReminderCategory, ReminderRuleRecord } from '../../../contracts/reminders.js';
import type { ExecutorDeps } from '../helpers.js';
import {
  asNumber,
  asNumericString,
  asString,
  asMessageId,
  buildIntentMeta,
  nowIso,
  persistWrites,
  readExternalActorId,
  readIncoming,
  readIncomingText,
} from '../helpers.js';
import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { createDbPort } from '../../../../infra/db/client.js';
import { enqueueOutgoingDeliveryIfAbsent } from '../../../../infra/db/repos/outgoingDeliveryQueue.js';
import { DEFAULT_REMINDER_DELIVERY_MAX_ATTEMPTS } from '../../../../infra/delivery/deliveryContract.js';
import { logger } from '../../../../infra/observability/logger.js';
import { getAppDisplayTimezone } from '../../../../config/appTimezone.js';
import {
  buildDefaultReminderRule,
  cycleReminderPreset,
  detectReminderPreset,
  planDueReminderOccurrences,
  reminderPresetConfig,
} from '../../reminders/policy.js';
import { buildPatientReminderDeepLink } from '../../reminders/buildPatientReminderDeepLink.js';
import { reminderOccurrenceTopicCode } from '../../reminders/reminderNotificationTopicCode.js';
import {
  buildReminderDispatchInlineKeyboard,
  buildReminderSkipReasonInlineKeyboard,
  reminderIntentPrimaryLabel,
} from '../../reminders/reminderInlineKeyboard.js';
import type { ReminderOpenLinkSpec } from '../../reminders/reminderInlineKeyboard.js';
import { buildExerciseReminderWebAppUrls } from '../../reminders/reminderMessengerWebAppUrls.js';
import { REMINDER_BY_CATEGORY } from '../templateKeys.js';

function escapeReminderHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildReminderCallbackAckIntents(
  action: Action,
  ctx: DomainContext,
  input: {
    chatId: number;
    messageId: unknown;
    callbackQueryId: string | null;
    text: string;
    channel: 'telegram' | 'max';
  },
): import('../../../contracts/index.js').OutgoingIntent[] {
  const intents: import('../../../contracts/index.js').OutgoingIntent[] = [];
  const mid = asMessageId(input.messageId);
  const useEdit = mid !== null;
  if (useEdit) {
    intents.push({
      type: 'message.edit',
      meta: buildIntentMeta(action, ctx),
      payload: {
        recipient: { chatId: input.chatId },
        messageId: mid,
        message: { text: input.text },
        parse_mode: 'HTML',
        replyMarkup: { inline_keyboard: [] },
        delivery: { channels: [input.channel], maxAttempts: 1 },
      },
    });
  } else {
    intents.push({
      type: 'message.send',
      meta: buildIntentMeta(action, ctx),
      payload: {
        recipient: { chatId: input.chatId },
        message: { text: input.text },
        parse_mode: 'HTML',
        delivery: { channels: [input.channel], maxAttempts: 1 },
      },
    });
  }
  if (input.callbackQueryId) {
    intents.push({
      type: 'callback.answer',
      meta: buildIntentMeta(action, ctx),
      payload: { callbackQueryId: input.callbackQueryId },
    });
  }
  return intents;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type PendingReminderDispatchEnqueue = {
  eventId: string;
  channel: string;
  payloadJson: Record<string, unknown>;
};

async function enqueueReminderDispatchBatchWithRetries(
  enqueueDb: ReturnType<typeof createDbPort>,
  rows: PendingReminderDispatchEnqueue[],
): Promise<void> {
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) await sleepMs(100 * 2 ** (attempt - 1));
      for (const row of rows) {
        await enqueueOutgoingDeliveryIfAbsent(enqueueDb, {
          eventId: row.eventId,
          kind: 'reminder_dispatch',
          channel: row.channel,
          payloadJson: row.payloadJson,
          maxAttempts: DEFAULT_REMINDER_DELIVERY_MAX_ATTEMPTS,
        });
      }
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  logger.error({ err: lastErr, rowCount: rows.length }, 'reminders.dispatchDue.enqueue_failed');
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
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
        quietHoursStartMinute: record.quietHoursStartMinute ?? null,
        quietHoursEndMinute: record.quietHoursEndMinute ?? null,
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
        quietHoursStartMinute: record.quietHoursStartMinute ?? null,
        quietHoursEndMinute: record.quietHoursEndMinute ?? null,
      },
    }];
    await persistWrites(deps.writePort, writes);
    return { actionId: action.id, status: 'success', writes, values: { reminderPreset: nextPreset } };
  }

  if (action.type === 'reminders.planDue') {
    if (!deps.readPort || !deps.writePort) {
      return { actionId: action.id, status: 'skipped', error: 'reminders.planDue: missing port' };
    }
    const nowPlanIso = asString(action.params.nowIso) ?? nowIso(ctx);
    const enabledRules = await deps.readPort.readDb<ReminderRuleRecord[]>({
      type: 'reminders.rules.enabled',
      params: {},
    });
    const rules = Array.isArray(enabledRules) ? enabledRules : [];
    const writes: import('../../../contracts/index.js').DbWriteMutation[] = [];
    for (const rule of rules) {
      const drafts = planDueReminderOccurrences(rule, nowPlanIso);
      for (const d of drafts) {
        writes.push({
          type: 'reminders.occurrence.upsertPlanned',
          params: {
            id: randomUUID(),
            ruleId: rule.id,
            occurrenceKey: d.occurrenceKey,
            plannedAt: d.plannedAt,
          },
        });
      }
    }
    await persistWrites(deps.writePort, writes);
    return {
      actionId: action.id,
      status: 'success',
      writes,
      values: { plannedOccurrenceUpserts: writes.length },
    };
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
    const pendingEnqueues: Array<{
      eventId: string;
      channel: string;
      payloadJson: Record<string, unknown>;
    }> = [];
    const linkedTitleCache = new Map<string, string | null>();
    const catalogDb = process.env.NODE_ENV === 'test' ? null : createDbPort();
    const reminderAuxDb = createDbPort();

    async function resolveLinkedTitle(rule: ReminderRuleRecord | undefined): Promise<string | null> {
      if (!catalogDb || !rule?.linkedObjectType || !rule?.linkedObjectId) return null;
      if (rule.linkedObjectType !== 'content_page' && rule.linkedObjectType !== 'content_section') return null;
      const cacheKey = `${rule.linkedObjectType}:${rule.linkedObjectId}`;
      if (linkedTitleCache.has(cacheKey)) return linkedTitleCache.get(cacheKey) ?? null;
      try {
        if (rule.linkedObjectType === 'content_page') {
          const res = await catalogDb.query<{ title: string }>(
            `SELECT title
             FROM public.content_pages
             WHERE slug = $1
               AND is_published = true
               AND deleted_at IS NULL
             LIMIT 1`,
            [rule.linkedObjectId],
          );
          const title = typeof res.rows[0]?.title === 'string' ? res.rows[0]!.title.trim() : '';
          const val = title.length > 0 ? title : null;
          linkedTitleCache.set(cacheKey, val);
          return val;
        }
        const res = await catalogDb.query<{ title: string }>(
          `SELECT title
           FROM public.content_sections
           WHERE slug = $1
           LIMIT 1`,
          [rule.linkedObjectId],
        );
        const title = typeof res.rows[0]?.title === 'string' ? res.rows[0]!.title.trim() : '';
        const val = title.length > 0 ? title : null;
        linkedTitleCache.set(cacheKey, val);
        return val;
      } catch {
        linkedTitleCache.set(cacheKey, null);
        return null;
      }
    }

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
      const linkedTitle = await resolveLinkedTitle(rule);
      type ReminderTitleMode =
        | { kind: 'fixed'; title: string }
        | { kind: 'template' };
      let titleMode: ReminderTitleMode;
      if (rule?.customTitle?.trim()) {
        titleMode = { kind: 'fixed', title: rule.customTitle.trim() };
      } else if (linkedTitle) {
        titleMode = { kind: 'fixed', title: linkedTitle };
      } else if (deps.templatePort) {
        titleMode = { kind: 'template' };
      } else {
        titleMode = { kind: 'fixed', title: 'Напоминание' };
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

      let remindersEditUrl: string | undefined;
      try {
        const u = new URL(openUrl);
        remindersEditUrl = `${u.origin}/app/patient/reminders?from=reminder`;
      } catch {
        remindersEditUrl = undefined;
      }

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

      const topicCode = reminderOccurrenceTopicCode(rule, occ.category);
      let sendChannels = channelsToSend;
      if (topicCode && deps.deliveryTargetsPort) {
        const tg = channelsToSend.find((c) => c.channel === 'telegram');
        const maxCh = channelsToSend.find((c) => c.channel === 'max');
        const bindingParams: { telegramId?: string; maxId?: string; topic: string } = { topic: topicCode };
        if (tg && tg.chatId > 0) bindingParams.telegramId = String(tg.chatId);
        if (maxCh?.externalId) bindingParams.maxId = maxCh.externalId;
        const bindings = await deps.deliveryTargetsPort.getTargetsByChannelBinding(bindingParams);
        const hasResolvedTopicBindings =
          bindings &&
          (Boolean(bindings.telegramId?.trim()) || Boolean(bindings.maxId?.trim()));
        if (hasResolvedTopicBindings) {
          sendChannels = channelsToSend.filter((ch) => {
            if (ch.channel === 'telegram') return Boolean(bindings.telegramId?.trim());
            if (ch.channel === 'max') return Boolean(bindings.maxId?.trim());
            return true;
          });
        }
      }

      for (const { channel, chatId, externalId } of sendChannels) {
        let reminderTitle: string;
        if (titleMode.kind === 'fixed') {
          reminderTitle = titleMode.title;
        } else if (deps.templatePort) {
          reminderTitle = (
            await deps.templatePort.renderTemplate({
              source: channel === 'max' ? 'max' : 'telegram',
              templateId: categoryTemplateId,
              vars: {},
              audience: 'user',
            })
          ).text.trim();
        } else {
          reminderTitle = 'Напоминание';
        }
        const webUrls = await buildExerciseReminderWebAppUrls({
          db: reminderAuxDb,
          channel,
          chatId,
          externalId,
          integratorUserId: occ.userId,
          reminderTargetUrl: openUrl,
        });
        const primarySpec: ReminderOpenLinkSpec = webUrls
          ? { kind: 'web_app', url: webUrls.primaryWebAppUrl }
          : { kind: 'url', url: openUrl };
        const scheduleSpec: ReminderOpenLinkSpec = webUrls
          ? { kind: 'web_app', url: webUrls.scheduleWebAppUrl }
          : { kind: 'url', url: remindersEditUrl ?? openUrl };
        const replyMarkup = buildReminderDispatchInlineKeyboard({
          primaryLabel: reminderIntentPrimaryLabel(rule?.reminderIntent ?? null),
          primary: primarySpec,
          schedule: scheduleSpec,
          occurrenceId: occ.id,
        });

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
        const intent = {
          type: 'message.send' as const,
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
        };
        const eventId = `rem:${occ.id}:${channel}`.slice(0, 240);
        let deleteBeforeSendMessageId: string | undefined;
        const stale = await deps.readPort.readDb<string | null>({
          type: 'reminders.delivery.staleMessengerMessage',
          params: { ruleId: occ.ruleId, excludeOccurrenceId: occ.id, channel },
        });
        if (typeof stale === 'string' && stale.trim().length > 0) {
          deleteBeforeSendMessageId = stale.trim();
        }
        pendingEnqueues.push({
          eventId,
          channel,
          payloadJson: {
            occurrenceId: occ.id,
            channel,
            deliveryLogId,
            externalId,
            logText: text,
            intent,
            ...(deleteBeforeSendMessageId !== undefined ? { deleteBeforeSendMessageId } : {}),
          },
        });
      }
    }

    await persistWrites(deps.writePort, writes);
    if (pendingEnqueues.length > 0) {
      const enqueueDb = createDbPort();
      await enqueueReminderDispatchBatchWithRetries(enqueueDb, pendingEnqueues);
    }
    return { actionId: action.id, status: 'success', writes, intents: [] };
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
    const minutesRounded = Math.round(minutesParsed);
    if (
      !Number.isFinite(minutesRounded)
      || minutesRounded < 1
      || minutesRounded > 720
      || minutesRounded !== minutesParsed
    ) {
      return { actionId: action.id, status: 'failed', error: 'reminders.snooze.callback: bad minutes' };
    }
    const minutes = minutesRounded;
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
      : `Ок, напомню позже через ${minutes} мин.`;
    const chatId =
      asNumber(action.params.chatId)
      ?? asNumber(readIncoming(ctx).chatId);
    const src = resource === 'max' ? 'max' : 'telegram';
    if (chatId === null) {
      return { actionId: action.id, status: 'failed', error: 'reminders.snooze.callback: missing chatId' };
    }
    const messageId = action.params.messageId ?? readIncoming(ctx).messageId;
    const callbackQueryId = asString(action.params.callbackQueryId) ?? asString(readIncoming(ctx).callbackQueryId);
    const intents = buildReminderCallbackAckIntents(action, ctx, {
      chatId,
      messageId,
      callbackQueryId,
      text: ack,
      channel: src,
    });
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
    const messageId = asMessageId(action.params.messageId) ?? asMessageId(readIncoming(ctx).messageId);
    const callbackQueryId = asString(action.params.callbackQueryId) ?? asString(readIncoming(ctx).callbackQueryId);
    const intents: import('../../../contracts/index.js').OutgoingIntent[] = [];
    if (messageId !== null) {
      intents.push({
        type: 'message.edit',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          messageId,
          message: { text: title },
          ...(replyMarkup.inline_keyboard.length > 0 ? { replyMarkup } : {}),
          parse_mode: 'HTML',
          delivery: { channels: [src], maxAttempts: 1 },
        },
      });
    } else {
      intents.push({
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          message: { text: title },
          ...(replyMarkup.inline_keyboard.length > 0 ? { replyMarkup } : {}),
          delivery: { channels: [src], maxAttempts: 1 },
        },
      });
    }
    if (callbackQueryId) {
      intents.push({
        type: 'callback.answer',
        meta: buildIntentMeta(action, ctx),
        payload: { callbackQueryId },
      });
    }
    return {
      actionId: action.id,
      status: 'success',
      intents,
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
      const messageId = asMessageId(action.params.messageId) ?? asMessageId(readIncoming(ctx).messageId);
      const callbackQueryId = asString(action.params.callbackQueryId) ?? asString(readIncoming(ctx).callbackQueryId);
      const intents: import('../../../contracts/index.js').OutgoingIntent[] = [];
      if (messageId !== null) {
        intents.push({
          type: 'message.edit',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: { chatId },
            messageId,
            message: { text: prompt },
            replyMarkup: { inline_keyboard: [] },
            parse_mode: 'HTML',
            delivery: { channels: [src], maxAttempts: 1 },
          },
        });
      } else {
        intents.push({
          type: 'message.send',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: { chatId },
            message: { text: prompt },
            delivery: { channels: [src], maxAttempts: 1 },
          },
        });
      }
      if (callbackQueryId) {
        intents.push({
          type: 'callback.answer',
          meta: buildIntentMeta(action, ctx),
          payload: { callbackQueryId },
        });
      }
      return {
        actionId: action.id,
        status: 'success',
        writes,
        intents,
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
      : 'Один пропуск - не проблема! Твое здоровье ещё может подождать...';
    const src = resource === 'max' ? 'max' : 'telegram';
    const messageId = action.params.messageId ?? readIncoming(ctx).messageId;
    const callbackQueryId = asString(action.params.callbackQueryId) ?? asString(readIncoming(ctx).callbackQueryId);
    const intents = buildReminderCallbackAckIntents(action, ctx, {
      chatId,
      messageId,
      callbackQueryId,
      text: ack,
      channel: src,
    });
    return {
      actionId: action.id,
      status: 'success',
      writes,
      intents,
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
      : 'Один пропуск - не проблема! Твое здоровье ещё может подождать...';
    const src = resourceFt === 'max' ? 'max' : 'telegram';
    const incoming = readIncoming(ctx);
    const replyEditTarget = asMessageId(incoming.replyToMessageId);
    const intents =
      replyEditTarget !== null && chatId !== null
        ? buildReminderCallbackAckIntents(action, ctx, {
            chatId,
            messageId: replyEditTarget,
            callbackQueryId: null,
            text: ack,
            channel: src,
          })
        : [{
            type: 'message.send' as const,
            meta: buildIntentMeta(action, ctx),
            payload: {
              recipient: { chatId },
              message: { text: ack },
              parse_mode: 'HTML' as const,
              delivery: { channels: [src], maxAttempts: 1 },
            },
          }];
    return {
      actionId: action.id,
      status: 'success',
      writes,
      intents,
      values: { conversationState: 'idle' },
    };
  }

  if (action.type === 'reminders.done.callback') {
    if (!deps.readPort) {
      return { actionId: action.id, status: 'skipped', error: 'reminders.done.callback: missing readPort' };
    }
    const occurrenceId = asString(action.params.occurrenceId);
    const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
    const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
    const chatId = asNumber(action.params.chatId) ?? asNumber(readIncoming(ctx).chatId);
    if (!occurrenceId || !channelUserId || chatId === null) {
      return { actionId: action.id, status: 'failed', error: 'reminders.done.callback: missing params' };
    }
    const userId = await resolveIntegratorUserId(deps.readPort, channelUserId, resource);
    if (!userId || !(await assertOccurrenceOwnedByUser(deps.readPort, occurrenceId, userId))) {
      return { actionId: action.id, status: 'failed', error: 'reminders.done.callback: forbidden' };
    }
    if (deps.remindersWebappWritesPort) {
      await deps.remindersWebappWritesPort.postOccurrenceDone({
        integratorUserId: userId,
        occurrenceId,
      });
    }
    const tplSrc = resource === 'max' ? 'max' : 'telegram';
    const ack = deps.templatePort
      ? (await deps.templatePort.renderTemplate({
          source: tplSrc,
          templateId: 'reminder.done.saved',
          vars: {},
          audience: 'user',
        })).text
      : 'Так держать! Не забывай отмечать самочувствие после разминки - это классно мотивирует, а еще на графике самочувствия будут красивые точки';
    const src = resource === 'max' ? 'max' : 'telegram';
    const messageId = action.params.messageId ?? readIncoming(ctx).messageId;
    const callbackQueryId = asString(action.params.callbackQueryId) ?? asString(readIncoming(ctx).callbackQueryId);
    const intents = buildReminderCallbackAckIntents(action, ctx, {
      chatId,
      messageId,
      callbackQueryId,
      text: ack,
      channel: src,
    });
    return { actionId: action.id, status: 'success', intents };
  }

  if (action.type === 'reminders.mute.callback') {
    if (!deps.readPort) {
      return { actionId: action.id, status: 'skipped', error: 'reminders.mute.callback: missing readPort' };
    }
    const mutePreset = asString(action.params.mutePreset) === 'tomorrow' ? 'tomorrow' : null;
    const mp = action.params.minutes;
    const minutesParsed = Number(
      typeof mp === 'number' && Number.isFinite(mp) ? mp : (typeof mp === 'string' ? mp.trim() : ''),
    );
    const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
    const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
    const chatId = asNumber(action.params.chatId) ?? asNumber(readIncoming(ctx).chatId);
    if (!channelUserId || chatId === null) {
      return { actionId: action.id, status: 'failed', error: 'reminders.mute.callback: missing params' };
    }
    const userId = await resolveIntegratorUserId(deps.readPort, channelUserId, resource);
    if (!userId) {
      return { actionId: action.id, status: 'failed', error: 'reminders.mute.callback: no user' };
    }

    let mutedUntilIso: string;
    let templateId: 'reminder.mute.saved' | 'reminder.mute.savedTomorrow' = 'reminder.mute.saved';
    let templateVars: Record<string, string> = {};

    if (mutePreset === 'tomorrow') {
      const dbPort = createDbPort();
      const appTz = await getAppDisplayTimezone(
        deps.dispatchPort
          ? { db: dbPort, dispatchPort: deps.dispatchPort }
          : { db: dbPort },
      );
      mutedUntilIso = DateTime.now().setZone(appTz).plus({ days: 1 }).startOf('day').toUTC().toISO() ?? new Date().toISOString();
      templateId = 'reminder.mute.savedTomorrow';
    } else {
      const minutesRounded = Math.round(minutesParsed);
      if (
        !Number.isFinite(minutesRounded)
        || minutesRounded < 1
        || minutesRounded > 1440
        || minutesRounded !== minutesParsed
      ) {
        return { actionId: action.id, status: 'failed', error: 'reminders.mute.callback: bad minutes' };
      }
      mutedUntilIso = new Date(Date.now() + minutesRounded * 60_000).toISOString();
      templateVars = { minutes: String(minutesRounded) };
    }

    if (deps.remindersWebappWritesPort) {
      await deps.remindersWebappWritesPort.postReminderMuteUntil({
        integratorUserId: userId,
        mutedUntilIso,
      });
    }
    const tplMs = resource === 'max' ? 'max' : 'telegram';
    const ack = deps.templatePort
      ? (await deps.templatePort.renderTemplate({
          source: tplMs,
          templateId,
          vars: templateVars,
          audience: 'user',
        })).text
      : mutePreset === 'tomorrow'
        ? 'Не вопрос, без напоминаний до завтра.'
        : `Не вопрос, замолкаю на ${templateVars.minutes ?? '?'} мин.`;
    const src = resource === 'max' ? 'max' : 'telegram';
    const messageId = action.params.messageId ?? readIncoming(ctx).messageId;
    const callbackQueryId = asString(action.params.callbackQueryId) ?? asString(readIncoming(ctx).callbackQueryId);
    const intents = buildReminderCallbackAckIntents(action, ctx, {
      chatId,
      messageId,
      callbackQueryId,
      text: ack,
      channel: src,
    });
    return {
      actionId: action.id,
      status: 'success',
      intents,
    };
  }

  return { actionId: action.id, status: 'skipped', error: 'REMINDERS_HANDLER_UNKNOWN_TYPE' };
}
