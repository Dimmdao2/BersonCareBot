import type {
  Action,
  ActionResult,
  DbWriteMutation,
  DomainContext,
} from '../../../contracts/index.js';
import type { DueReminderOccurrence, ReminderRuleRecord } from '../../../contracts/reminders.js';
import type { DeliveryTargetsFetchResult } from '../../../contracts/notificationChannels.js';
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
} from '../helpers.js';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createDbPort } from '../../../../infra/db/client.js';
import { runIntegratorSql } from '../../../../infra/db/runIntegratorSql.js';
import { enqueueOutgoingDeliveryIfAbsent } from '../../../../infra/db/repos/outgoingDeliveryQueue.js';
import {
  recordMessengerChannelSkipsBestEffort,
  recordMessengerNotEnqueuedSkipsBestEffort,
} from '../../../../infra/db/repos/notificationDeliveryAttempts.js';
import { DEFAULT_REMINDER_DELIVERY_MAX_ATTEMPTS } from '../../../../infra/delivery/deliveryContract.js';
import { logger } from '../../../../infra/observability/logger.js';
import { planDueReminderOccurrences } from '../../reminders/policy.js';
import {
  buildPatientReminderDeepLink,
  reminderDispatchUsesIntentOpenTarget,
} from '../../reminders/buildPatientReminderDeepLink.js';
import { reminderOccurrenceTopicCode } from '../../reminders/reminderNotificationTopicCode.js';
import {
  buildReminderDispatchInlineKeyboard,
  buildReminderSnoozeMenuInlineKeyboard,
  buildReminderNotifSettingsInlineKeyboard,
  reminderIntentPrimaryLabel,
  reminderLinkKeyboardButton,
} from '../../reminders/reminderInlineKeyboard.js';
import type { InlineKeyboardButton } from '../../reminders/reminderInlineKeyboard.js';
import { maxBindingRecipient } from '../../../../integrations/max/maxRecipient.js';
import { env } from '../../../../config/env.js';
import { REMINDER_BY_CATEGORY } from '../templateKeys.js';
import { runWithOptionalOrganizationPrincipal } from '../../../../infra/principal/organizationPrincipal.js';

type OrganizationWriteBucket = {
  organizationId: string | null;
  writes: DbWriteMutation[];
};

function escapeReminderHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function trimTrailingSlash(s: string): string {
  const t = s.trim();
  if (t.length === 0) return '';
  return t.replace(/\/+$/, '');
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
    /** When set (non-empty keyboard), replaces default «remove keyboard». */
    replyMarkup?: InlineKeyboardButton[][];
  },
): import('../../../contracts/index.js').OutgoingIntent[] {
  const intents: import('../../../contracts/index.js').OutgoingIntent[] = [];
  const mid = asMessageId(input.messageId);
  const useEdit = mid !== null;
  const editReplyMarkup =
    input.replyMarkup && input.replyMarkup.length > 0
      ? { inline_keyboard: input.replyMarkup }
      : { inline_keyboard: [] };
  if (input.callbackQueryId) {
    intents.push({
      type: 'callback.answer',
      meta: buildIntentMeta(action, ctx),
      payload: { callbackQueryId: input.callbackQueryId },
    });
  }
  if (useEdit) {
    intents.push({
      type: 'message.edit',
      meta: buildIntentMeta(action, ctx),
      payload: {
        recipient: { chatId: input.chatId },
        messageId: mid,
        message: { text: input.text },
        parse_mode: 'HTML',
        replyMarkup: editReplyMarkup,
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
        ...(input.replyMarkup && input.replyMarkup.length > 0
          ? { replyMarkup: editReplyMarkup }
          : {}),
        delivery: { channels: [input.channel], maxAttempts: 1 },
      },
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

function reminderOrganizationId(value: { organizationId?: string | null }): string | null {
  return typeof value.organizationId === 'string' && value.organizationId.trim().length > 0
    ? value.organizationId.trim()
    : null;
}

function addWriteToOrganizationBucket(
  buckets: Map<string, OrganizationWriteBucket>,
  organizationId: string | null,
  write: DbWriteMutation,
): void {
  const key = organizationId ?? '';
  const existing = buckets.get(key);
  if (existing) {
    existing.writes.push(write);
    return;
  }
  buckets.set(key, { organizationId, writes: [write] });
}

async function persistWritesByOrganization(
  writePort: NonNullable<ExecutorDeps['writePort']>,
  buckets: Map<string, OrganizationWriteBucket>,
): Promise<void> {
  for (const bucket of buckets.values()) {
    await runWithOptionalOrganizationPrincipal(bucket.organizationId, () =>
      persistWrites(writePort, bucket.writes),
    );
  }
}

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
  if (action.type === 'reminders.planDue') {
    if (!deps.readPort || !deps.writePort) {
      return { actionId: action.id, status: 'skipped', error: 'reminders.planDue: missing port' };
    }
    const nowPlanIso = asString(action.params.nowIso) ?? nowIso(ctx);
    await persistWrites(deps.writePort, [
      {
        type: 'reminders.occurrence.expireOrphanedPending',
        params: { nowIso: nowPlanIso },
      },
    ]);
    const enabledRules = await deps.readPort.readDb<ReminderRuleRecord[]>({
      type: 'reminders.rules.enabled',
      params: {},
    });
    const rules = Array.isArray(enabledRules) ? enabledRules : [];
    const writes: DbWriteMutation[] = [];
    const writeBuckets = new Map<string, OrganizationWriteBucket>();
    for (const rule of rules) {
      const drafts = planDueReminderOccurrences(rule, nowPlanIso);
      for (const d of drafts) {
        const write = {
          type: 'reminders.occurrence.upsertPlanned',
          params: {
            id: randomUUID(),
            ruleId: rule.id,
            occurrenceKey: d.occurrenceKey,
            plannedAt: d.plannedAt,
          },
        } satisfies DbWriteMutation;
        writes.push(write);
        addWriteToOrganizationBucket(writeBuckets, reminderOrganizationId(rule), write);
      }
    }
    await persistWritesByOrganization(deps.writePort, writeBuckets);
    return {
      actionId: action.id,
      status: 'success',
      writes,
      values: { plannedOccurrenceUpserts: writes.length },
    };
  }

  if (action.type === 'reminders.dispatchDue') {
    if (!deps.readPort || !deps.writePort)
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'reminders.dispatchDue: missing port',
      };
    const dueNowIso = asString(action.params.nowIso) ?? nowIso(ctx);
    const limit = asNumber(action.params.limit) ?? 50;
    const dueList = await deps.readPort.readDb<DueReminderOccurrence[]>({
      type: 'reminders.occurrences.due',
      params: { nowIso: dueNowIso, limit: Math.max(1, Math.min(limit, 100)) },
    });
    const items = Array.isArray(dueList) ? dueList : [];
    const writes: DbWriteMutation[] = [];
    const writeBuckets = new Map<string, OrganizationWriteBucket>();
    const pendingEnqueues: Array<{
      eventId: string;
      channel: string;
      payloadJson: Record<string, unknown>;
    }> = [];
    const linkedTitleCache = new Map<string, string | null>();
    const catalogDb = process.env.NODE_ENV === 'test' ? null : createDbPort();
    const reminderAuxDb = createDbPort();

    async function resolveLinkedTitle(
      rule: ReminderRuleRecord | undefined,
    ): Promise<string | null> {
      if (!catalogDb || !rule?.linkedObjectType || !rule?.linkedObjectId) return null;
      if (rule.linkedObjectType !== 'content_page' && rule.linkedObjectType !== 'content_section')
        return null;
      const cacheKey = `${rule.linkedObjectType}:${rule.linkedObjectId}`;
      if (linkedTitleCache.has(cacheKey)) return linkedTitleCache.get(cacheKey) ?? null;
      try {
        if (rule.linkedObjectType === 'content_page') {
          const res = await runIntegratorSql<{ title: string }>(
            catalogDb,
            sql`SELECT title
             FROM public.content_pages
             WHERE slug = ${rule.linkedObjectId}
               AND is_published = true
               AND deleted_at IS NULL
             LIMIT 1`,
          );
          const title = typeof res.rows[0]?.title === 'string' ? res.rows[0]!.title.trim() : '';
          const val = title.length > 0 ? title : null;
          linkedTitleCache.set(cacheKey, val);
          return val;
        }
        const res = await runIntegratorSql<{ title: string }>(
          catalogDb,
          sql`SELECT title
           FROM public.content_sections
           WHERE slug = ${rule.linkedObjectId}
           LIMIT 1`,
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
    async function rulesForUser(
      userId: string,
      organizationId: string,
    ): Promise<Map<string, ReminderRuleRecord>> {
      const cacheKey = `${organizationId}:${userId}`;
      const hit = rulesCache.get(cacheKey);
      if (hit) return hit;
      const rules = await deps.readPort!.readDb<ReminderRuleRecord[]>({
        type: 'reminders.rules.forUser',
        params: { userId, organizationId },
      });
      const map = new Map<string, ReminderRuleRecord>();
      for (const r of Array.isArray(rules) ? rules : []) {
        map.set(r.id, r);
      }
      rulesCache.set(cacheKey, map);
      return map;
    }

    for (const occ of items) {
      const markQueuedWrite = {
        type: 'reminders.occurrence.markQueued',
        params: { occurrenceId: occ.id, deliveryJobId: null },
      } satisfies DbWriteMutation;
      writes.push(markQueuedWrite);
      const occurrenceOrganizationId = reminderOrganizationId(occ);
      if (!occurrenceOrganizationId) {
        throw new Error(`reminders.dispatchDue occurrence ${occ.id} is missing organizationId`);
      }
      addWriteToOrganizationBucket(writeBuckets, occurrenceOrganizationId, markQueuedWrite);

      const rule =
        (occ.userId
          ? (await rulesForUser(occ.userId, occurrenceOrganizationId)).get(occ.ruleId)
          : await deps.readPort.readDb<ReminderRuleRecord | null>({
              type: 'reminders.rule.byId',
              params: { ruleId: occ.ruleId },
            })) ?? undefined;
      const categoryKey = REMINDER_BY_CATEGORY[occ.category] ?? 'telegram:reminder.exercise';
      const categoryTemplateId = categoryKey.replace(/^telegram:/, '').replace(/^max:/, '');
      const linkedTitle = await resolveLinkedTitle(rule);
      type ReminderTitleMode = { kind: 'fixed'; title: string } | { kind: 'template' };
      let titleMode: ReminderTitleMode;
      if (rule?.customTitle?.trim()) {
        titleMode = { kind: 'fixed', title: rule.customTitle.trim() };
      } else if (linkedTitle) {
        titleMode = { kind: 'fixed', title: linkedTitle };
      } else if (deps.templatePort) {
        titleMode = { kind: 'template' };
      } else throw new Error(`reminders.dispatchDue copy unavailable for ${occ.id}`);
      const reminderBodyRaw = rule?.customText?.trim() ?? '';
      const reminderBody = reminderBodyRaw ? escapeReminderHtml(reminderBodyRaw) : '';
      const computedOpen = buildPatientReminderDeepLink({
        appBaseUrl: env.APP_BASE_URL,
        linkedObjectType: rule?.linkedObjectType ?? null,
        linkedObjectId: rule?.linkedObjectId ?? null,
        reminderIntent: rule?.reminderIntent ?? null,
        organizationId: occurrenceOrganizationId,
      });
      const computedOpenIsOrganizationGo = computedOpen.includes('/app/patient/go/');
      const openUrl =
        reminderDispatchUsesIntentOpenTarget(rule?.reminderIntent ?? null) ||
        computedOpenIsOrganizationGo
          ? computedOpen
          : (rule?.deepLink?.trim() && rule.deepLink.trim().length > 0
              ? rule.deepLink.trim()
              : computedOpen) ||
            buildPatientReminderDeepLink({
              appBaseUrl: env.APP_BASE_URL,
              linkedObjectType: null,
              linkedObjectId: null,
              reminderIntent: null,
              organizationId: occurrenceOrganizationId,
            });

      let remindersEditUrl: string | undefined;
      try {
        const u = new URL(openUrl);
        remindersEditUrl = `${u.origin}/app/patient/reminders?from=reminder`;
      } catch {
        remindersEditUrl = undefined;
      }

      type ChannelIdentity = { resource: string; externalId: string; chatId: number };
      const allIdentities = occ.userId
        ? await deps.readPort.readDb<ChannelIdentity[]>({
            type: 'identities.allByUserId',
            params: { userId: occ.userId },
          })
        : [];

      const channelsToSend: Array<{
        channel: 'telegram' | 'max';
        chatId: number;
        externalId: string;
      }> = [];
      if (occ.chatId > 0) {
        channelsToSend.push({
          channel: 'telegram',
          chatId: occ.chatId,
          externalId: String(occ.chatId),
        });
      }
      if (Array.isArray(allIdentities)) {
        for (const identity of allIdentities) {
          if (identity.resource === 'max' && identity.chatId > 0) {
            channelsToSend.push({
              channel: 'max',
              chatId: identity.chatId,
              externalId: identity.externalId,
            });
          }
        }
      }

      const topicCode = reminderOccurrenceTopicCode(rule, occ.category);
      let sendChannels = channelsToSend;
      let deliveryTargetsFetched: DeliveryTargetsFetchResult | null | undefined;
      if (topicCode) {
        if (!deps.deliveryTargetsPort?.getTargetsByPlatformUser) {
          throw new Error(`reminders.dispatchDue delivery target port unavailable for ${occ.id}`);
        }
        deliveryTargetsFetched = await deps.deliveryTargetsPort.getTargetsByPlatformUser({
          platformUserId: occ.platformUserId,
          topic: topicCode,
          ...(occ.userId ? { integratorUserId: occ.userId } : {}),
          organizationId: occurrenceOrganizationId,
        });
        const fetched = deliveryTargetsFetched;
        if (!fetched) {
          throw new Error(
            `reminders.dispatchDue delivery target unavailable for occurrence ${occ.id}`,
          );
        }
        if (fetched?.tenantDenied) {
          throw new Error(
            `reminders.dispatchDue delivery target tenant denied for occurrence ${occ.id}`,
          );
        }
        const bindings = fetched?.channelBindings;
        if (fetched?.resolution) {
          logger.info(
            {
              event: 'notification_channels_resolved',
              deliveryPath: 'integrator_worker',
              intentType: rule?.reminderIntent ?? undefined,
              userId: fetched.resolution.userId,
              integratorUserId: fetched.resolution.integratorUserId ?? occ.userId,
              topicCode: fetched.resolution.topicCode,
              availableChannels: fetched.resolution.availableChannels,
              enabledChannels: fetched.resolution.enabledChannels,
              selectedChannels: fetched.resolution.selectedChannels,
              skippedChannels: fetched.resolution.skippedChannels,
            },
            'notification channels resolved',
          );
        }
        const hasResolvedTopicBindings =
          bindings && (Boolean(bindings.telegramId?.trim()) || Boolean(bindings.maxId?.trim()));
        if (fetched?.resolution?.selectedChannels) {
          // Apply selectedChannels filter unconditionally when a resolution exists.
          // If selectedChannels is empty for messenger channels, sendChannels becomes [] for those channels
          // (channel OFF = no message sent), regardless of whether bindings are present.
          const selectedSet = new Set(fetched.resolution.selectedChannels);
          sendChannels = channelsToSend.filter((ch) => selectedSet.has(ch.channel));
        } else if (hasResolvedTopicBindings) {
          sendChannels = channelsToSend.filter((ch) => {
            if (ch.channel === 'telegram') return Boolean(bindings.telegramId?.trim());
            if (ch.channel === 'max') return Boolean(bindings.maxId?.trim());
            return true;
          });
        }
      }

      const selectedChannels = new Set(deliveryTargetsFetched?.resolution?.selectedChannels ?? []);

      if (topicCode && occ.userId) {
        const resolutionSkipped = deliveryTargetsFetched?.resolution?.skippedChannels ?? [];
        const alreadySkipped = new Set<string>();
        if (resolutionSkipped.length > 0) {
          await recordMessengerChannelSkipsBestEffort(reminderAuxDb, {
            integratorUserId: occ.userId,
            occurrenceId: occ.id,
            topicCode,
            skippedChannels: resolutionSkipped,
            organizationId: occurrenceOrganizationId,
          });
          for (const s of resolutionSkipped) {
            if (s.channel === 'telegram' || s.channel === 'max') alreadySkipped.add(s.channel);
          }
        }
        await recordMessengerNotEnqueuedSkipsBestEffort(reminderAuxDb, {
          integratorUserId: occ.userId,
          occurrenceId: occ.id,
          topicCode,
          sendChannels,
          alreadySkippedChannels: alreadySkipped,
          organizationId: occurrenceOrganizationId,
        });
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
        } else throw new Error(`reminders.dispatchDue copy unavailable for ${occ.id}`);
        const replyMarkup = buildReminderDispatchInlineKeyboard({
          primaryLabel: reminderIntentPrimaryLabel(rule?.reminderIntent ?? null),
          primaryUrl: openUrl,
          scheduleUrl: remindersEditUrl ?? openUrl,
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
        const deliveryLogId = `rdl:${occ.id}:g${occ.deliveryGeneration}:${channel}`;
        const eventId = `rem:${occ.id}:g${occ.deliveryGeneration}:${channel}`.slice(0, 240);
        const intent = {
          type: 'message.send' as const,
          meta: {
            eventId,
            occurredAt: dueNowIso,
            source: channel,
            outboundMessageClass: 'routine_product' as const,
            outboundCapability: 'essential_delivery' as const,
            ...(occ.userId ? { userId: occ.userId } : {}),
          },
          payload: {
            recipient: channel === 'max' ? maxBindingRecipient(externalId, chatId) : { chatId },
            message: { text },
            replyMarkup,
            parse_mode: 'HTML',
            delivery: { channels: [channel], maxAttempts: 1 },
          },
        };
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
            deliveryGeneration: occ.deliveryGeneration,
            topicCode,
            channel,
            deliveryLogId,
            externalId,
            logText: text,
            intent,
            ...(deleteBeforeSendMessageId !== undefined ? { deleteBeforeSendMessageId } : {}),
          },
        });
      }

      if (selectedChannels.has('web_push') && topicCode) {
        const webPushTitle =
          titleMode.kind === 'fixed'
            ? titleMode.title
            : deps.templatePort
              ? (
                  await deps.templatePort.renderTemplate({
                    source: 'telegram',
                    templateId: categoryTemplateId,
                    vars: {},
                    audience: 'user',
                  })
                ).text.trim()
              : null;
        if (!webPushTitle) {
          throw new Error(`reminders.dispatchDue web push copy unavailable for ${occ.id}`);
        }
        const channel = 'web_push';
        const deliveryLogId = `rdl:${occ.id}:g${occ.deliveryGeneration}:${channel}`;
        const eventId = `rem:${occ.id}:g${occ.deliveryGeneration}:${channel}`.slice(0, 240);
        const pushBody = reminderBodyRaw.trim() || webPushTitle;
        pendingEnqueues.push({
          eventId,
          channel,
          payloadJson: {
            occurrenceId: occ.id,
            deliveryGeneration: occ.deliveryGeneration,
            topicCode,
            channel,
            deliveryLogId,
            externalId: occ.platformUserId,
            logText: pushBody,
            intent: {
              type: 'message.send',
              meta: {
                eventId,
                occurredAt: dueNowIso,
                source: channel,
                outboundMessageClass: 'routine_product',
                outboundCapability: 'app_push',
                ...(occ.userId ? { userId: occ.userId } : {}),
              },
              payload: {
                recipient: { pushUserId: occ.platformUserId },
                message: { text: pushBody },
                title: webPushTitle,
                url: openUrl,
                pushExtras: {
                  tag: `reminder:${occ.id}:g${occ.deliveryGeneration}`,
                  topicCode,
                  intentType: 'patient_reminder',
                  occurrenceId: occ.id,
                },
                delivery: { channels: [channel], maxAttempts: 1 },
              },
            },
          },
        });
      }

      const emailRecipient = deliveryTargetsFetched?.emailRecipient?.trim() || null;
      if (selectedChannels.has('email') && emailRecipient && topicCode) {
        const channel = 'email';
        const emailTitle =
          titleMode.kind === 'fixed'
            ? titleMode.title
            : deps.templatePort
              ? (
                  await deps.templatePort.renderTemplate({
                    source: 'telegram',
                    templateId: categoryTemplateId,
                    vars: {},
                    audience: 'user',
                  })
                ).text.trim()
              : null;
        if (!emailTitle) {
          throw new Error(`reminders.dispatchDue email copy unavailable for ${occ.id}`);
        }
        const deliveryLogId = `rdl:${occ.id}:g${occ.deliveryGeneration}:${channel}`;
        const eventId = `rem:${occ.id}:g${occ.deliveryGeneration}:${channel}`.slice(0, 240);
        const emailText = `${reminderBodyRaw.trim() || emailTitle}\n\n${openUrl}`.slice(0, 8000);
        pendingEnqueues.push({
          eventId,
          channel,
          payloadJson: {
            occurrenceId: occ.id,
            deliveryGeneration: occ.deliveryGeneration,
            topicCode,
            channel,
            deliveryLogId,
            platformUserId: occ.platformUserId,
            externalId: emailRecipient,
            logText: emailText,
            intent: {
              type: 'message.send',
              meta: {
                eventId,
                occurredAt: dueNowIso,
                source: channel,
                outboundMessageClass: 'routine_product',
                outboundCapability: 'essential_delivery',
                ...(occ.userId ? { userId: occ.userId } : {}),
              },
              payload: {
                recipient: { email: emailRecipient },
                message: { text: emailText },
                subject: emailTitle.slice(0, 200),
                url: openUrl,
                delivery: { channels: [channel], maxAttempts: 1 },
              },
            },
          },
        });
      }
    }

    await persistWritesByOrganization(deps.writePort, writeBuckets);
    if (pendingEnqueues.length > 0) {
      const enqueueDb = createDbPort();
      await enqueueReminderDispatchBatchWithRetries(enqueueDb, pendingEnqueues);
    }
    return { actionId: action.id, status: 'success', writes, intents: [] };
  }

  if (action.type === 'reminders.snooze.callback') {
    if (!deps.readPort || !deps.writePort) {
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'reminders.snooze.callback: missing port',
      };
    }
    const occurrenceId = asString(action.params.occurrenceId);
    const mp = action.params.minutes;
    const minutesParsed = Number(
      typeof mp === 'number' && Number.isFinite(mp) ? mp : typeof mp === 'string' ? mp.trim() : '',
    );
    const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
    const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
    if (!occurrenceId || !channelUserId) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.snooze.callback: missing ids',
      };
    }
    const minutesRounded = Math.round(minutesParsed);
    if (
      !Number.isFinite(minutesRounded) ||
      minutesRounded < 1 ||
      minutesRounded > 720 ||
      minutesRounded !== minutesParsed
    ) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.snooze.callback: bad minutes',
      };
    }
    const minutes = minutesRounded;
    const userId = await resolveIntegratorUserId(deps.readPort, channelUserId, resource);
    if (!userId || !(await assertOccurrenceOwnedByUser(deps.readPort, occurrenceId, userId))) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.snooze.callback: forbidden',
      };
    }
    if (!deps.remindersWebappWritesPort) {
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'reminders.snooze.callback: no remindersWebappWritesPort',
      };
    }
    const w = await deps.remindersWebappWritesPort.postOccurrenceSnooze({
      occurrenceId,
      minutes,
    });
    if (!w.ok) {
      return {
        actionId: action.id,
        status: 'failed',
        error: `reminders.snooze.callback: ${w.error}`,
      };
    }
    const tplSource = resource === 'max' ? 'max' : 'telegram';
    if (!deps.templatePort) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.snooze.callback: copy unavailable',
      };
    }
    const ack = (
      await deps.templatePort.renderTemplate({
        source: tplSource,
        templateId: 'reminder.snoozeAck',
        vars: { minutes: String(minutes) },
        audience: 'user',
      })
    ).text;
    const chatId = asNumber(action.params.chatId) ?? asNumber(readIncoming(ctx).chatId);
    const src = resource === 'max' ? 'max' : 'telegram';
    if (chatId === null) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.snooze.callback: missing chatId',
      };
    }
    const messageId = action.params.messageId ?? readIncoming(ctx).messageId;
    const callbackQueryId =
      asString(action.params.callbackQueryId) ?? asString(readIncoming(ctx).callbackQueryId);
    const intents = buildReminderCallbackAckIntents(action, ctx, {
      chatId,
      messageId,
      callbackQueryId,
      text: ack,
      channel: src,
    });
    return { actionId: action.id, status: 'success', intents };
  }

  if (action.type === 'reminders.skip.applyPreset') {
    if (!deps.readPort || !deps.writePort) {
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'reminders.skip.applyPreset: missing port',
      };
    }
    const occurrenceId = asString(action.params.occurrenceId);
    const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
    const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
    const chatId = asNumber(action.params.chatId) ?? asNumber(readIncoming(ctx).chatId);
    if (!occurrenceId || !channelUserId || chatId === null) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.skip.applyPreset: missing params',
      };
    }
    const userId = await resolveIntegratorUserId(deps.readPort, channelUserId, resource);
    if (!userId || !(await assertOccurrenceOwnedByUser(deps.readPort, occurrenceId, userId))) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.skip.applyPreset: forbidden',
      };
    }

    if (!deps.remindersWebappWritesPort) {
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'reminders.skip.applyPreset: no remindersWebappWritesPort',
      };
    }
    const web = await deps.remindersWebappWritesPort.postOccurrenceSkip({
      occurrenceId,
      reason: null,
    });
    if (!web.ok) {
      return {
        actionId: action.id,
        status: 'failed',
        error: `reminders.skip.applyPreset: ${web.error}`,
      };
    }
    const tplSaved = resource === 'max' ? 'max' : 'telegram';
    if (!deps.templatePort) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.skip.applyPreset: copy unavailable',
      };
    }
    const ack = (
      await deps.templatePort.renderTemplate({
        source: tplSaved,
        templateId: 'reminder.skip.saved',
        vars: {},
        audience: 'user',
      })
    ).text;
    const src = resource === 'max' ? 'max' : 'telegram';
    const messageId = action.params.messageId ?? readIncoming(ctx).messageId;
    const callbackQueryId =
      asString(action.params.callbackQueryId) ?? asString(readIncoming(ctx).callbackQueryId);
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

  if (action.type === 'reminders.done.callback') {
    if (!deps.readPort) {
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'reminders.done.callback: missing readPort',
      };
    }
    const occurrenceId = asString(action.params.occurrenceId);
    const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
    const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
    const chatId = asNumber(action.params.chatId) ?? asNumber(readIncoming(ctx).chatId);
    if (!occurrenceId || !channelUserId || chatId === null) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.done.callback: missing params',
      };
    }
    const userId = await resolveIntegratorUserId(deps.readPort, channelUserId, resource);
    if (!userId || !(await assertOccurrenceOwnedByUser(deps.readPort, occurrenceId, userId))) {
      return { actionId: action.id, status: 'failed', error: 'reminders.done.callback: forbidden' };
    }
    if (!deps.remindersWebappWritesPort) {
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'reminders.done.callback: no remindersWebappWritesPort',
      };
    }
    const web = await deps.remindersWebappWritesPort.postOccurrenceDone({
      occurrenceId,
    });
    if (!web.ok) {
      return {
        actionId: action.id,
        status: 'failed',
        error: `reminders.done.callback: ${web.error}`,
      };
    }

    const tplSrc = resource === 'max' ? 'max' : 'telegram';
    const src = resource === 'max' ? 'max' : 'telegram';
    const messageId = action.params.messageId ?? readIncoming(ctx).messageId;
    const callbackQueryId =
      asString(action.params.callbackQueryId) ?? asString(readIncoming(ctx).callbackQueryId);
    const mid = asMessageId(messageId);

    const intents: import('../../../contracts/index.js').OutgoingIntent[] = [];
    if (callbackQueryId) {
      intents.push({
        type: 'callback.answer',
        meta: buildIntentMeta(action, ctx),
        payload: { callbackQueryId },
      });
    }
    if (mid !== null) {
      intents.push({
        type: 'message.delete',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          messageId: mid,
          delivery: { channels: [src], maxAttempts: 1 },
        },
      });
    }
    if (web.firstDoneForOccurrence && web.dayFullyDone && web.daySentTotal > 0) {
      const vars = { done: String(web.dayDoneCount), total: String(web.daySentTotal) };
      if (!deps.templatePort) {
        return {
          actionId: action.id,
          status: 'failed',
          error: 'reminders.done.callback: copy unavailable',
        };
      }
      const celebration = (
        await deps.templatePort.renderTemplate({
          source: tplSrc,
          templateId: 'reminder.dayAllDone',
          vars,
          audience: 'user',
        })
      ).text;
      intents.push({
        type: 'message.send',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          message: { text: celebration },
          parse_mode: 'HTML',
          delivery: { channels: [src], maxAttempts: 1 },
        },
      });
    }
    return { actionId: action.id, status: 'success', intents };
  }

  if (action.type === 'reminders.mute.callback') {
    if (!deps.readPort) {
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'reminders.mute.callback: missing readPort',
      };
    }
    const mutePreset = asString(action.params.mutePreset) === 'tomorrow' ? 'tomorrow' : null;
    const mp = action.params.minutes;
    const minutesParsed = Number(
      typeof mp === 'number' && Number.isFinite(mp) ? mp : typeof mp === 'string' ? mp.trim() : '',
    );
    const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
    const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
    const chatId = asNumber(action.params.chatId) ?? asNumber(readIncoming(ctx).chatId);
    if (!channelUserId || chatId === null) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.mute.callback: missing params',
      };
    }
    const userId = await resolveIntegratorUserId(deps.readPort, channelUserId, resource);
    if (!userId) {
      return { actionId: action.id, status: 'failed', error: 'reminders.mute.callback: no user' };
    }

    let templateId: 'reminder.mute.saved' | 'reminder.mute.savedTomorrow' = 'reminder.mute.saved';
    let templateVars: Record<string, string> = {};
    let minutes: number | null = null;

    if (mutePreset === 'tomorrow') {
      templateId = 'reminder.mute.savedTomorrow';
    } else {
      const minutesRounded = Math.round(minutesParsed);
      if (
        !Number.isFinite(minutesRounded) ||
        minutesRounded < 1 ||
        minutesRounded > 1440 ||
        minutesRounded !== minutesParsed
      ) {
        return {
          actionId: action.id,
          status: 'failed',
          error: 'reminders.mute.callback: bad minutes',
        };
      }
      minutes = minutesRounded;
      templateVars = { minutes: String(minutesRounded) };
    }

    if (!deps.remindersWebappWritesPort) {
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'reminders.mute.callback: no remindersWebappWritesPort',
      };
    }
    const mute = await deps.remindersWebappWritesPort.postReminderMuteUntil({
      minutes,
      untilTomorrow: mutePreset === 'tomorrow',
    });
    if (!mute.ok) {
      return {
        actionId: action.id,
        status: 'failed',
        error: `reminders.mute.callback: ${mute.error}`,
      };
    }
    const tplMs = resource === 'max' ? 'max' : 'telegram';
    if (!deps.templatePort) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.mute.callback: copy unavailable',
      };
    }
    const ack = (
      await deps.templatePort.renderTemplate({
        source: tplMs,
        templateId,
        vars: templateVars,
        audience: 'user',
      })
    ).text;
    const src = resource === 'max' ? 'max' : 'telegram';
    const messageId = action.params.messageId ?? readIncoming(ctx).messageId;
    const callbackQueryId =
      asString(action.params.callbackQueryId) ?? asString(readIncoming(ctx).callbackQueryId);
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

  if (action.type === 'reminders.messengerTopic.disable.callback') {
    if (!deps.readPort) {
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'reminders.messengerTopic.disable.callback: missing readPort',
      };
    }
    if (!deps.remindersWebappWritesPort) {
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'reminders.messengerTopic.disable.callback: no remindersWebappWritesPort',
      };
    }

    const occurrenceId = asString(action.params.occurrenceId);
    const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
    const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
    const chatId = asNumber(action.params.chatId) ?? asNumber(readIncoming(ctx).chatId);

    const messengerChannel: 'telegram' | 'max' = resource === 'max' ? 'max' : 'telegram';

    if (!occurrenceId || !channelUserId || chatId === null) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.messengerTopic.disable.callback: missing params',
      };
    }

    const userId = await resolveIntegratorUserId(deps.readPort, channelUserId, resource);
    if (!userId || !(await assertOccurrenceOwnedByUser(deps.readPort, occurrenceId, userId))) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.messengerTopic.disable.callback: forbidden',
      };
    }

    const web = await deps.remindersWebappWritesPort.postMessengerTopicDisable({
      occurrenceId,
      messengerChannel,
    });
    if (!web.ok) {
      return {
        actionId: action.id,
        status: 'failed',
        error: `reminders.messengerTopic.disable.callback: ${web.error}`,
      };
    }

    const src = messengerChannel === 'max' ? 'max' : 'telegram';
    const messageId = action.params.messageId ?? readIncoming(ctx).messageId;
    const callbackQueryId =
      asString(action.params.callbackQueryId) ?? asString(readIncoming(ctx).callbackQueryId);

    const baseHttpRaw = trimTrailingSlash(env.APP_BASE_URL);
    const appBaseUrl =
      baseHttpRaw.startsWith('http://') || baseHttpRaw.startsWith('https://') ? baseHttpRaw : '';
    const profileUrl = appBaseUrl
      ? `${appBaseUrl}/app/patient/profile#patient-profile-notifications`
      : '/app/patient/profile#patient-profile-notifications';
    const mobileUrl = appBaseUrl ? `${appBaseUrl}/app/patient` : '/app/patient';

    const ackText = web.paragraphs.map((p) => escapeReminderHtml(p)).join('\n\n');

    const followUpKb: InlineKeyboardButton[][] = [
      [
        reminderLinkKeyboardButton('Настроить каналы уведомлений', profileUrl),
        reminderLinkKeyboardButton('Установить мобильное приложение', mobileUrl),
      ],
    ];

    const intents = buildReminderCallbackAckIntents(action, ctx, {
      chatId,
      messageId,
      callbackQueryId,
      text: ackText,
      channel: src,
      replyMarkup: followUpKb,
    });
    return {
      actionId: action.id,
      status: 'success',
      intents,
    };
  }

  if (action.type === 'reminders.snoozeMenu.callback') {
    if (!deps.readPort) {
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'reminders.snoozeMenu.callback: no readPort',
      };
    }
    const occurrenceId = asString(action.params.occurrenceId);
    const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
    const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
    const chatId = asNumber(action.params.chatId) ?? asNumber(readIncoming(ctx).chatId);
    if (!occurrenceId || !channelUserId || chatId === null) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.snoozeMenu.callback: missing params',
      };
    }
    const userId = await resolveIntegratorUserId(deps.readPort, channelUserId, resource);
    if (!userId || !(await assertOccurrenceOwnedByUser(deps.readPort, occurrenceId, userId))) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.snoozeMenu.callback: forbidden',
      };
    }
    const src = resource === 'max' ? 'max' : 'telegram';
    const messageId =
      asMessageId(action.params.messageId) ?? asMessageId(readIncoming(ctx).messageId);
    const callbackQueryId =
      asString(action.params.callbackQueryId) ?? asString(readIncoming(ctx).callbackQueryId);
    const snoozeKb = buildReminderSnoozeMenuInlineKeyboard(occurrenceId);
    const intents: import('../../../contracts/index.js').OutgoingIntent[] = [];
    if (callbackQueryId) {
      intents.push({
        type: 'callback.answer',
        meta: buildIntentMeta(action, ctx),
        payload: { callbackQueryId },
      });
    }
    if (messageId !== null) {
      intents.push({
        type: 'message.edit',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          messageId,
          message: { text: 'Когда напомнить?' },
          ...(snoozeKb.inline_keyboard.length > 0 ? { replyMarkup: snoozeKb } : {}),
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
          message: { text: 'Когда напомнить?' },
          ...(snoozeKb.inline_keyboard.length > 0 ? { replyMarkup: snoozeKb } : {}),
          delivery: { channels: [src], maxAttempts: 1 },
        },
      });
    }
    return { actionId: action.id, status: 'success', intents };
  }

  if (action.type === 'reminders.notifSettings.open.callback') {
    if (!deps.readPort) {
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'reminders.notifSettings.open.callback: no readPort',
      };
    }
    if (!deps.remindersWebappWritesPort) {
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'reminders.notifSettings.open.callback: no remindersWebappWritesPort',
      };
    }
    const occurrenceId = asString(action.params.occurrenceId);
    const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
    const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
    const chatId = asNumber(action.params.chatId) ?? asNumber(readIncoming(ctx).chatId);
    if (!occurrenceId || !channelUserId || chatId === null) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.notifSettings.open.callback: missing params',
      };
    }
    const userId = await resolveIntegratorUserId(deps.readPort, channelUserId, resource);
    if (!userId || !(await assertOccurrenceOwnedByUser(deps.readPort, occurrenceId, userId))) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.notifSettings.open.callback: forbidden',
      };
    }
    const messengerChannel: 'telegram' | 'max' = resource === 'max' ? 'max' : 'telegram';
    const settingsResult = await deps.remindersWebappWritesPort.getNotificationSettings({
      messengerChannel,
    });
    const topics = settingsResult.ok ? settingsResult.topics : [];
    const notifKb = buildReminderNotifSettingsInlineKeyboard(topics);
    const src = messengerChannel;
    const messageId =
      asMessageId(action.params.messageId) ?? asMessageId(readIncoming(ctx).messageId);
    const callbackQueryId =
      asString(action.params.callbackQueryId) ?? asString(readIncoming(ctx).callbackQueryId);
    const settingsText =
      'Выберите, какие уведомления вы хотите видеть в боте.\n\nНастройки пуш-уведомлений и почты можно поменять в приложении bersoncare.ru';
    const intents: import('../../../contracts/index.js').OutgoingIntent[] = [];
    if (callbackQueryId) {
      intents.push({
        type: 'callback.answer',
        meta: buildIntentMeta(action, ctx),
        payload: { callbackQueryId },
      });
    }
    if (messageId !== null) {
      intents.push({
        type: 'message.edit',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          messageId,
          message: { text: settingsText },
          ...(notifKb.inline_keyboard.length > 0 ? { replyMarkup: notifKb } : {}),
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
          message: { text: settingsText },
          ...(notifKb.inline_keyboard.length > 0 ? { replyMarkup: notifKb } : {}),
          delivery: { channels: [src], maxAttempts: 1 },
        },
      });
    }
    return { actionId: action.id, status: 'success', intents };
  }

  if (action.type === 'reminders.notifSettings.toggle.callback') {
    if (!deps.readPort) {
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'reminders.notifSettings.toggle.callback: no readPort',
      };
    }
    if (!deps.remindersWebappWritesPort) {
      return {
        actionId: action.id,
        status: 'skipped',
        error: 'reminders.notifSettings.toggle.callback: no remindersWebappWritesPort',
      };
    }
    const topicCode = asString(action.params.topicCode);
    const channelUserId = asNumericString(action.params.channelUserId) ?? readExternalActorId(ctx);
    const resource = asString(action.params.resource) ?? ctx.event.meta.source ?? 'telegram';
    const chatId = asNumber(action.params.chatId) ?? asNumber(readIncoming(ctx).chatId);
    if (!topicCode || !channelUserId || chatId === null) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.notifSettings.toggle.callback: missing params',
      };
    }
    const userId = await resolveIntegratorUserId(deps.readPort, channelUserId, resource);
    if (!userId) {
      return {
        actionId: action.id,
        status: 'failed',
        error: 'reminders.notifSettings.toggle.callback: user not found',
      };
    }
    const messengerChannel: 'telegram' | 'max' = resource === 'max' ? 'max' : 'telegram';
    const toggle = await deps.remindersWebappWritesPort.toggleNotificationTopic({
      topicCode,
      messengerChannel,
    });
    if (!toggle.ok) {
      return {
        actionId: action.id,
        status: 'failed',
        error: `reminders.notifSettings.toggle.callback: ${toggle.error}`,
      };
    }
    const settingsResult = await deps.remindersWebappWritesPort.getNotificationSettings({
      messengerChannel,
    });
    const topics = settingsResult.ok ? settingsResult.topics : [];
    const notifKb = buildReminderNotifSettingsInlineKeyboard(topics);
    const src = messengerChannel;
    const messageId =
      asMessageId(action.params.messageId) ?? asMessageId(readIncoming(ctx).messageId);
    const callbackQueryId =
      asString(action.params.callbackQueryId) ?? asString(readIncoming(ctx).callbackQueryId);
    const settingsText =
      'Выберите, какие уведомления вы хотите видеть в боте.\n\nНастройки пуш-уведомлений и почты можно поменять в приложении bersoncare.ru';
    const intents: import('../../../contracts/index.js').OutgoingIntent[] = [];
    if (callbackQueryId) {
      intents.push({
        type: 'callback.answer',
        meta: buildIntentMeta(action, ctx),
        payload: { callbackQueryId },
      });
    }
    if (messageId !== null) {
      intents.push({
        type: 'message.edit',
        meta: buildIntentMeta(action, ctx),
        payload: {
          recipient: { chatId },
          messageId,
          message: { text: settingsText },
          ...(notifKb.inline_keyboard.length > 0 ? { replyMarkup: notifKb } : {}),
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
          message: { text: settingsText },
          ...(notifKb.inline_keyboard.length > 0 ? { replyMarkup: notifKb } : {}),
          delivery: { channels: [src], maxAttempts: 1 },
        },
      });
    }
    return { actionId: action.id, status: 'success', intents };
  }

  return { actionId: action.id, status: 'skipped', error: 'REMINDERS_HANDLER_UNKNOWN_TYPE' };
}
