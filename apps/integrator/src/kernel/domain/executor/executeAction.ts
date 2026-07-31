/**
 * Исполнитель действий бота: по типу действия выполняет одну операцию — отправить сообщение,
 * записать в БД, показать клавиатуру, обработать уведомления, запись на приём
 * и т.д. Возвращает результат (успех/ошибка), записи в БД, исходящие сообщения и задания на доставку.
 */

import { randomUUID } from 'node:crypto';
import type {
  Action,
  ActionResult,
  DbWriteDbResult,
  DbWriteMutation,
  DomainContext,
  OutgoingIntent,
  PhoneLinkFailureReason,
} from '../../contracts/index.js';
import {
} from '../reminders/policy.js';
import { handleBooking } from './handlers/booking.js';
import { handleDelivery } from './handlers/delivery.js';
import { handleNotifications } from './handlers/notifications.js';
import { handleReminders } from './handlers/reminders.js';
import {
  buildDoctorPatientMessageNotificationIntents,
  handleConversationAdminReply,
  handleConversationUserMessage,
} from './handlers/supportRelay.js';
import {
  type ExecutorDeps,
  asRecord,
  asString,
  asMessageId,
  asNumber,
  readIncoming,
  readIncomingText,
  readIncomingChatId,
  readIncomingMessageId,
  readConversationId,
  readExternalActorId,
  readMessengerChannelUserId,
  readIncomingPhone,
  formatActorLabel,
  buildIntentMeta,
  renderText,
  buildReplyMarkup,
  persistWrites,
  expandContentMenuParam,
  sendAdminMessage,
} from './helpers.js';
import { ADMIN } from './templateKeys.js';
import { dispatchRequestContactToUser } from '../../../integrations/bersoncare/dispatchRequestContact.js';
import { logger } from '../../../infra/observability/logger.js';
import {
  phoneLinkChannelBoundElsewhereUserMessage,
  phoneLinkConflictUserMessage,
  phoneLinkIntegratorMismatchUserMessage,
  phoneLinkLegacyContactsConflictUserMessage,
  phoneLinkMergeBlockedUserMessage,
  phoneLinkNoBindingUserMessage,
  phoneLinkNoIntegratorIdentityUserMessage,
  phoneLinkSaveFailedUserMessage,
} from '../../../shared/phoneLinkUserMessages.js';

const BOOKING_TYPES = new Set<string>(['booking.event.insert']);
const NOTIFICATION_TYPES = new Set<string>(['notifications.get', 'notifications.toggle']);
const REMINDER_TYPES = new Set<string>([
  'reminders.rules.get',
  'reminders.rule.toggle',
  'reminders.rule.cyclePreset',
  'reminders.planDue',
  'reminders.dispatchDue',
  'reminders.snooze.callback',
  'reminders.done.callback',
  'reminders.mute.callback',
  'reminders.skip.reasonPrompt',
  'reminders.skip.applyPreset',
  'reminders.skip.applyFreeText',
  'reminders.messengerTopic.disable.callback',
  'reminders.snoozeMenu.callback',
  'reminders.notifSettings.open.callback',
  'reminders.notifSettings.toggle.callback',
]);

const DELIVERY_TYPES = new Set<string>([
  'callback.answer',
  'message.deliver',
  'message.retry.enqueue',
  'intent.enqueueDelivery',
  'message.send',
]);

function channelLinkCompleteFailureTemplateKey(source: string, errRaw: string | undefined): string {
  const e = (errRaw ?? '').trim().toLowerCase();
  /** PRODUCT_REASONS (WEBAPP_FIRST_PHONE_BIND): mismatch → generic / support path */
  if (e === 'integrator_id_mismatch') {
    return `${source}:channelLink.completeFailed.generic`;
  }
  const conflictLike = new Set([
    'conflict',
    'channel_owned_by_real_user',
    'channel_link_claim_rejected',
    'phone_owned_by_other_user',
  ]);
  if (conflictLike.has(e)) {
    return `${source}:channelLink.completeFailed.conflict`;
  }
  if (
    e === 'invalid_token' ||
    e === 'unknown_or_expired' ||
    e === 'used_token' ||
    e.includes('expired')
  ) {
    return `${source}:channelLink.completeFailed.expired`;
  }
  return `${source}:channelLink.completeFailed.generic`;
}

function phoneMessengerBindCompleteFailureTemplateKey(
  source: string,
  errRaw: string | undefined,
): string {
  const e = (errRaw ?? '').trim().toLowerCase();
  if (e === 'phone_mismatch') {
    return `${source}:phoneAuthMismatch`;
  }
  const conflictLike = new Set([
    'conflict',
    'phone_owned_by_other_user',
    'channel_owned_by_other_user',
    'channel_owned_by_real_user',
  ]);
  if (conflictLike.has(e)) {
    return `${source}:channelLink.completeFailed.conflict`;
  }
  if (
    e === 'invalid_token' ||
    e === 'unknown_or_expired' ||
    e === 'used_token' ||
    e.includes('expired')
  ) {
    return `${source}:channelLink.completeFailed.expired`;
  }
  return `${source}:phoneAuthFailed`;
}

function parsePhoneAuthSetupToken(ctx: DomainContext): string | null {
  const state =
    typeof ctx.base.conversationState === 'string' ? ctx.base.conversationState.trim() : '';
  const prefix = 'await_phoneauth:';
  if (!state.startsWith(prefix)) return null;
  const token = state.slice(prefix.length).trim();
  return /^auth_[A-Za-z0-9_-]+$/.test(token) ? token : null;
}

function resolveChannelLinkFailureChatId(
  ctx: DomainContext,
  externalId: string,
): string | number | null {
  const fromCtx = readIncomingChatId(ctx);
  if (fromCtx !== null && String(fromCtx).trim() !== '') {
    const n = Number(fromCtx);
    if (Number.isFinite(n)) return n;
    return String(fromCtx).trim();
  }
  const n = Number(externalId);
  if (Number.isFinite(n)) return n;
  const t = externalId.trim();
  return t.length > 0 ? t : null;
}

function phoneMessengerBindPhoneLinkSyncFailureTemplateKey(
  source: string,
  reason: PhoneLinkFailureReason | undefined,
  indeterminate: boolean,
): string {
  if (indeterminate || reason === 'db_transient_failure') {
    return `${source}:phoneAuthFailed`;
  }
  if (reason === 'phone_owned_by_other_user' || reason === 'channel_already_bound_to_other_user') {
    return `${source}:channelLink.completeFailed.conflict`;
  }
  if (
    reason === 'integrator_id_mismatch' ||
    reason === 'no_integrator_identity' ||
    reason === 'no_channel_binding'
  ) {
    return `${source}:phoneAuthFailed`;
  }
  if (
    reason === 'merge_blocked_booking_overlap' ||
    reason === 'merge_blocked_distinct_real_users' ||
    reason === 'merge_blocked_lfk_conflict' ||
    reason === 'merge_blocked_ambiguous_candidates' ||
    reason === 'merge_blocked_integrator_conflict' ||
    reason === 'legacy_contacts_conflict'
  ) {
    return `${source}:channelLink.completeFailed.conflict`;
  }
  return `${source}:phoneAuthFailed`;
}

function pushCallbackAnswerFromIncoming(
  intents: OutgoingIntent[],
  action: Action,
  ctx: DomainContext,
  suffix: string,
): void {
  const callbackQueryId = asString(readIncoming(ctx).callbackQueryId);
  if (!callbackQueryId) return;
  intents.push({
    type: 'callback.answer',
    meta: buildIntentMeta({ ...action, id: `${action.id}:${suffix}` }, ctx),
    payload: { callbackQueryId },
  });
}

async function appendPhoneMessengerBindFailureRecovery(
  failureIntents: OutgoingIntent[],
  action: Action,
  ctx: DomainContext,
  fullDeps: ExecutorDeps,
  opts: {
    source: 'telegram' | 'max';
    externalId: string;
    menuActionIdSuffix: string;
    failureText?: { templateKey: string; intentIdSuffix: string };
  },
): Promise<void> {
  const chatId = resolveChannelLinkFailureChatId(ctx, opts.externalId);
  if (chatId === null) return;

  const tplPort = fullDeps.templatePort;
  if (tplPort && opts.failureText) {
    const text = await renderText({
      templateKey: opts.failureText.templateKey,
      ctx,
      templatePort: tplPort,
    });
    if (text.trim().length > 0) {
      const channels = opts.source === 'max' ? ['max'] : ['telegram'];
      failureIntents.push({
        type: 'message.send',
        meta: buildIntentMeta(
          { ...action, id: `${action.id}:${opts.failureText.intentIdSuffix}` },
          ctx,
        ),
        payload: {
          recipient: { chatId },
          message: { text },
          delivery: { channels, maxAttempts: 1 },
        },
      });
    }
  }

  failureIntents.push(
    ...(await buildPhoneMessengerBindMainMenuIntents(action, ctx, fullDeps, {
      source: opts.source,
      externalId: opts.externalId,
      templateKey: `${opts.source}:chooseMenu`,
      actionIdSuffix: opts.menuActionIdSuffix,
      menuOnly: true,
    })),
  );
}

async function buildPhoneAuthLoginUrlIntents(
  action: Action,
  ctx: DomainContext,
  fullDeps: ExecutorDeps,
  opts: { source: 'telegram' | 'max'; externalId: string },
): Promise<OutgoingIntent[]> {
  if (!readWebappHomeUrlFromFacts(ctx) || !fullDeps.templatePort) return [];
  const chatId = resolveChannelLinkFailureChatId(ctx, opts.externalId);
  if (chatId === null) return [];
  const inlineAction: Action = {
    id: `${action.id}:phone-auth-open-app-url`,
    type: 'message.inlineKeyboard.show',
    mode: 'async',
    params: {
      chatId,
      templateKey: `${opts.source}:phoneAuthOpenAppPrompt`,
      inlineKeyboard: [
        [
          {
            textTemplateKey: `${opts.source}:phoneAuthOpenAppButton`,
            urlFact: 'links.webappHomeUrl',
          },
        ],
      ],
      delivery: { channels: [opts.source], maxAttempts: 1 },
    },
  };
  const inlineResult = await executeAction(inlineAction, ctx, fullDeps);
  return inlineResult.intents ?? [];
}

async function buildPhoneMessengerBindMainMenuIntents(
  action: Action,
  ctx: DomainContext,
  fullDeps: ExecutorDeps,
  opts: {
    source: 'telegram' | 'max';
    externalId: string;
    templateKey: string;
    actionIdSuffix: string;
    menuOnly?: boolean;
    showLoginUrlButton?: boolean;
  },
): Promise<OutgoingIntent[]> {
  const tplPort = fullDeps.templatePort;
  if (!tplPort) return [];

  const loginUrlIntents =
    opts.showLoginUrlButton && !opts.menuOnly
      ? await buildPhoneAuthLoginUrlIntents(action, ctx, fullDeps, {
          source: opts.source,
          externalId: opts.externalId,
        })
      : [];

  if (opts.source === 'telegram') {
    const rawChat = readIncomingChatId(ctx);
    const fromEvent = rawChat !== null ? Number(rawChat) : NaN;
    const tgChatId = Number.isFinite(fromEvent) ? fromEvent : Number(opts.externalId);
    if (!Number.isFinite(tgChatId)) return [];
    const menuAction: Action = {
      id: `${action.id}:${opts.actionIdSuffix}`,
      type: 'message.replyKeyboard.show',
      mode: 'async',
      params: {
        chatId: tgChatId,
        templateKey: opts.menuOnly ? 'telegram:chooseMenu' : opts.templateKey,
        keyboard: [[{ textTemplateKey: 'telegram:menu.book' }]],
        resizeKeyboard: true,
      },
    };
    const menuResult = await executeAction(menuAction, ctx, fullDeps);
    return [...(menuResult.intents ?? []), ...loginUrlIntents];
  }

  const chatIdResolved = resolveChannelLinkFailureChatId(ctx, opts.externalId);
  if (chatIdResolved === null) return [];
  const inlineAction: Action = {
    id: `${action.id}:${opts.actionIdSuffix}`,
    type: 'message.inlineKeyboard.show',
    mode: 'async',
    params: {
      chatId: chatIdResolved,
      templateKey: opts.menuOnly ? 'max:chooseMenu' : opts.templateKey,
      menu: 'main',
      delivery: { channels: ['max'], maxAttempts: 1 },
    },
  };
  const inlineResult = await executeAction(inlineAction, ctx, fullDeps);
  return [...(inlineResult.intents ?? []), ...loginUrlIntents];
}

function readWebappHomeUrlFromFacts(ctx: DomainContext): string | null {
  const facts = asRecord(ctx.base?.facts ?? {});
  const links = asRecord(facts.links);
  const u = links?.webappHomeUrl;
  return typeof u === 'string' && u.trim().length > 0 ? u.trim() : null;
}

export async function executeAction(
  action: Action,
  ctx: DomainContext,
  deps: ExecutorDeps = {},
): Promise<ActionResult> {
  const fullDeps: ExecutorDeps = { ...deps, executeAction };
  if (BOOKING_TYPES.has(action.type)) return handleBooking(action, ctx, fullDeps);
  if (NOTIFICATION_TYPES.has(action.type)) return handleNotifications(action, ctx, fullDeps);
  if (REMINDER_TYPES.has(action.type)) return handleReminders(action, ctx, fullDeps);
  if (DELIVERY_TYPES.has(action.type)) return handleDelivery(action, ctx, fullDeps);

  switch (action.type) {
    case 'event.log': {
      const writes: DbWriteMutation[] = [{ type: 'event.log', params: action.params }];
      await persistWrites(deps.writePort, writes);
      return { actionId: action.id, status: 'success', writes };
    }

    case 'webapp.phoneMessengerBind.complete': {
      const port = deps.webappEventsPort;
      const setupToken = asString(action.params.setupToken) ?? parsePhoneAuthSetupToken(ctx);
      const channelCode = asString(action.params.channelCode) ?? ctx.event.meta.source;
      const externalId = asString(action.params.externalId) ?? ctx.event.meta.userId;
      const phoneNormalized = asString(action.params.phoneNormalized) ?? readIncomingPhone(ctx);
      if (!setupToken || !externalId || !phoneNormalized) {
        return {
          actionId: action.id,
          status: 'failed',
          error: 'webapp.phoneMessengerBind.complete: setupToken, externalId and phone required',
        };
      }
      if (!port?.completePhoneMessengerBind) {
        return {
          actionId: action.id,
          status: 'success',
          values: {
            phoneMessengerBind: { ok: false, reason: 'phone_messenger_bind_port_missing' },
          },
        };
      }
      const messengerChannel = channelCode === 'max' ? 'max' : 'telegram';
      const result = await port.completePhoneMessengerBind({
        setupToken,
        channelCode: messengerChannel,
        externalId,
        phoneNormalized,
      });
      const source = ctx.event.meta.source;
      const tplPort = fullDeps.templatePort;
      const chatId = resolveChannelLinkFailureChatId(ctx, externalId);

      if (!result.ok) {
        const errMsg = result.error ?? 'phone messenger bind failed';
        logger.warn(
          {
            event: 'phone_messenger_bind_complete_failed',
            error: errMsg,
            externalId,
            channelCode: messengerChannel,
          },
          '[webapp.phoneMessengerBind.complete] failed',
        );
        const failureIntents: OutgoingIntent[] = [];
        if (source === 'telegram' || source === 'max') {
          await appendPhoneMessengerBindFailureRecovery(failureIntents, action, ctx, fullDeps, {
            source,
            externalId,
            menuActionIdSuffix: 'phone-auth-failed-menu',
            ...(tplPort
              ? {
                  failureText: {
                    templateKey: phoneMessengerBindCompleteFailureTemplateKey(source, errMsg),
                    intentIdSuffix: 'phone-auth-failed',
                  },
                }
              : {}),
          });
        }
        return {
          actionId: action.id,
          status: 'failed',
          error: errMsg,
          values: { phoneMessengerBind: { ok: false, error: result.error } },
          ...(failureIntents.length > 0 ? { intents: failureIntents } : {}),
        };
      }

      if (!fullDeps.writePort) {
        const failureIntents: OutgoingIntent[] = [];
        if (source === 'telegram' || source === 'max') {
          await appendPhoneMessengerBindFailureRecovery(failureIntents, action, ctx, fullDeps, {
            source,
            externalId,
            menuActionIdSuffix: 'phone-auth-write-port-missing-menu',
          });
        }
        return {
          actionId: action.id,
          status: 'failed',
          error: 'webapp.phoneMessengerBind.complete: writePort required for phone link sync',
          values: { phoneMessengerBind: { ok: false, reason: 'write_port_missing' } },
          ...(failureIntents.length > 0 ? { intents: failureIntents } : {}),
        };
      }

      const syncWrites: DbWriteMutation[] = [];
      syncWrites.push({
        type: 'user.phone.link',
        params: {
          resource: messengerChannel,
          channelUserId: externalId,
          phoneNormalized,
          ...(ctx.event.meta.correlationId ? { correlationId: ctx.event.meta.correlationId } : {}),
        },
      });
      syncWrites.push({
        type: 'user.state.set',
        params: {
          resource: messengerChannel,
          channelUserId: externalId,
          state: 'idle',
        },
      });

      const appliedWrites: DbWriteMutation[] = [];
      let phoneLinkSyncFailure:
        | { error: string; phoneLinkReason?: PhoneLinkFailureReason; indeterminate?: boolean }
        | undefined;
      if (syncWrites.length > 0 && fullDeps.writePort) {
        for (const write of syncWrites) {
          const meta = await fullDeps.writePort.writeDb(write);
          appliedWrites.push(write);
          if (write.type === 'user.phone.link') {
            const hasMeta =
              typeof meta === 'object' && meta !== null && 'userPhoneLinkApplied' in meta;
            const m = hasMeta ? (meta as DbWriteDbResult) : null;
            const indeterminate = !hasMeta || m?.phoneLinkIndeterminate === true;
            const notApplied = hasMeta && m && !m.userPhoneLinkApplied;
            if (notApplied || indeterminate) {
              const reason = m?.phoneLinkReason;
              phoneLinkSyncFailure = {
                error:
                  reason !== undefined
                    ? `phone messenger bind phone sync: ${reason}`
                    : indeterminate
                      ? 'phone messenger bind phone sync: indeterminate'
                      : 'phone messenger bind phone sync: not applied',
                ...(reason !== undefined ? { phoneLinkReason: reason } : {}),
                indeterminate,
              };
              logger.warn(
                {
                  event: 'phone_messenger_bind_phone_sync_failed',
                  externalId,
                  channelCode: messengerChannel,
                  phoneLinkReason: reason,
                  indeterminate,
                },
                '[webapp.phoneMessengerBind.complete] user.phone.link did not apply',
              );
              break;
            }
          }
        }
      }

      if (phoneLinkSyncFailure) {
        const failureIntents: OutgoingIntent[] = [];
        if (source === 'telegram' || source === 'max') {
          await appendPhoneMessengerBindFailureRecovery(failureIntents, action, ctx, fullDeps, {
            source,
            externalId,
            menuActionIdSuffix: 'phone-auth-sync-failed-menu',
            ...(tplPort
              ? {
                  failureText: {
                    templateKey: phoneMessengerBindPhoneLinkSyncFailureTemplateKey(
                      source,
                      phoneLinkSyncFailure.phoneLinkReason,
                      phoneLinkSyncFailure.indeterminate === true,
                    ),
                    intentIdSuffix: 'phone-auth-phone-sync-failed',
                  },
                }
              : {}),
          });
        }
        return {
          actionId: action.id,
          status: 'failed',
          error: phoneLinkSyncFailure.error,
          values: {
            phoneMessengerBind: {
              ok: false,
              webappComplete: true,
              phoneLinkSync: { ok: false, reason: phoneLinkSyncFailure.phoneLinkReason },
            },
          },
          ...(failureIntents.length > 0 ? { intents: failureIntents } : {}),
          ...(appliedWrites.length > 0 ? { writes: appliedWrites } : {}),
        };
      }

      const successIntents: OutgoingIntent[] = [];
      const bindPurpose = result.purpose === 'profile_bind' ? 'profile_bind' : 'login';

      if (tplPort && (source === 'telegram' || source === 'max') && chatId !== null) {
        const isReplay = result.replay === true;
        if (bindPurpose === 'profile_bind') {
          successIntents.push(
            ...(await buildPhoneMessengerBindMainMenuIntents(action, ctx, fullDeps, {
              source,
              externalId,
              templateKey: `${source}:phoneAuthPhoneLinked`,
              actionIdSuffix: 'phone-auth-linked',
            })),
          );
        } else if (!isReplay) {
          const loginTemplateKey =
            result.accountCreated === true
              ? `${source}:phoneAuthAccountCreated`
              : `${source}:phoneAuthLoginCode`;
          successIntents.push(
            ...(await buildPhoneMessengerBindMainMenuIntents(action, ctx, fullDeps, {
              source,
              externalId,
              templateKey: loginTemplateKey,
              actionIdSuffix: 'phone-auth-code',
              showLoginUrlButton: bindPurpose === 'login',
            })),
          );
        } else {
          successIntents.push(
            ...(await buildPhoneMessengerBindMainMenuIntents(action, ctx, fullDeps, {
              source,
              externalId,
              templateKey:
                result.accountCreated === true
                  ? `${source}:phoneAuthAccountCreated`
                  : `${source}:phoneAuthLoginCode`,
              actionIdSuffix: 'phone-auth-code-replay',
              menuOnly: true,
            })),
          );
        }
      }

      logger.info(
        {
          event: 'phone_messenger_bind_complete_ok',
          metric: 'phone_messenger_bind_complete_ok',
          externalId,
          channelCode: messengerChannel,
          accountCreated: result.accountCreated === true,
          replay: result.replay === true,
          purpose: bindPurpose,
        },
        '[webapp.phoneMessengerBind.complete] ok',
      );

      return {
        actionId: action.id,
        status: 'success',
        values: {
          phoneMessengerBind: {
            ok: true,
            purpose: bindPurpose,
            accountCreated: result.accountCreated === true,
            challengeId: result.challengeId,
            status: result.status,
            replay: result.replay === true,
          },
        },
        ...(appliedWrites.length > 0 ? { writes: appliedWrites } : {}),
        ...(successIntents.length > 0 ? { intents: successIntents } : {}),
      };
    }

    case 'webapp.programNote.replyBegin': {
      const port = deps.webappEventsPort;
      const stageItemId =
        asString(action.params.stageItemId) ?? asString(readIncoming(ctx).stageItemId);
      if (!stageItemId) {
        const intents: OutgoingIntent[] = [];
        pushCallbackAnswerFromIncoming(intents, action, ctx, 'reply-begin-missing-stage-ack');
        return {
          actionId: action.id,
          status: 'success',
          error: 'webapp.programNote.replyBegin: stageItemId required',
          intents,
          abortPlan: true,
        };
      }
      if (!port?.beginProgramNoteReply) {
        const intents: OutgoingIntent[] = [];
        const adminChatId = asNumber(readIncoming(ctx).chatId);
        const source = ctx.event.meta.source;
        if (adminChatId !== null && (source === 'telegram' || source === 'max')) {
          intents.push({
            type: 'message.send',
            meta: buildIntentMeta(action, ctx),
            payload: {
              recipient: { chatId: adminChatId },
              message: {
                text: 'Не удалось открыть ответ на комментарий. Попробуйте в кабинете врача.',
              },
              delivery: { channels: [source], maxAttempts: 1 },
            },
          });
          pushCallbackAnswerFromIncoming(intents, action, ctx, 'reply-begin-port-missing-ack');
        }
        return {
          actionId: action.id,
          status: 'success',
          values: { programNoteReply: { ok: false, reason: 'program_note_reply_port_missing' } },
          intents,
          abortPlan: true,
        };
      }
      const result = await port.beginProgramNoteReply({
        stageItemId,
        idempotencyKey: `program-note-reply-begin:${stageItemId}`,
      });
      if (!result.ok || !result.programNoteReplyState) {
        const intents: OutgoingIntent[] = [];
        const adminChatId = asNumber(readIncoming(ctx).chatId);
        const source = ctx.event.meta.source;
        if (adminChatId !== null && (source === 'telegram' || source === 'max')) {
          intents.push({
            type: 'message.send',
            meta: buildIntentMeta(action, ctx),
            payload: {
              recipient: { chatId: adminChatId },
              message: {
                text: 'Не удалось открыть ответ на комментарий. Попробуйте в кабинете врача.',
              },
              delivery: { channels: [source], maxAttempts: 1 },
            },
          });
          pushCallbackAnswerFromIncoming(intents, action, ctx, 'reply-begin-failed-ack');
        }
        return {
          actionId: action.id,
          status: 'success',
          values: { programNoteReply: { ok: false, error: result.error } },
          intents,
          abortPlan: true,
        };
      }
      const channelUserId = readMessengerChannelUserId(ctx, action);
      const resource = ctx.event.meta.source;
      const writes: DbWriteMutation[] = [];
      if (deps.writePort && channelUserId && (resource === 'telegram' || resource === 'max')) {
        const stateWrite: DbWriteMutation = {
          type: 'user.state.set',
          params: {
            resource,
            channelUserId,
            state: result.programNoteReplyState,
          },
        };
        await persistWrites(deps.writePort, [stateWrite]);
        writes.push(stateWrite);
      }
      return {
        actionId: action.id,
        status: 'success',
        values: {
          programNoteReply: { ok: true },
          programNoteReplyState: result.programNoteReplyState,
        },
        ...(writes.length > 0 ? { writes } : {}),
      };
    }

    case 'webapp.channelLink.complete': {
      const port = deps.webappEventsPort;
      const linkToken = asString(action.params.linkToken);
      const channelCode = asString(action.params.channelCode) ?? 'telegram';
      const externalId = asString(action.params.externalId);
      if (!linkToken || !externalId) {
        return {
          actionId: action.id,
          status: 'failed',
          error: 'webapp.channelLink.complete: linkToken and externalId required',
        };
      }
      if (!port?.completeChannelLink) {
        return {
          actionId: action.id,
          status: 'success',
          values: { channelLink: { ok: false, reason: 'channel_link_port_missing' } },
        };
      }
      const result = await port.completeChannelLink({ linkToken, channelCode, externalId });
      if (!result.ok) {
        const errMsg = result.error ?? 'channel link failed';
        logger.warn(
          {
            event: 'channel_link_complete_failed',
            error: errMsg,
            externalId,
            channelCode,
          },
          '[webapp.channelLink.complete] failed',
        );

        const failureIntents: OutgoingIntent[] = [];
        const tplPort = fullDeps.templatePort;
        const source = ctx.event.meta.source;
        if (tplPort && (source === 'telegram' || source === 'max')) {
          const chatId = resolveChannelLinkFailureChatId(ctx, externalId);
          if (chatId !== null) {
            const templateKey = channelLinkCompleteFailureTemplateKey(source, errMsg);
            const text = await renderText({
              templateKey,
              ctx,
              templatePort: tplPort,
            });
            if (text.trim().length > 0) {
              const channels = source === 'max' ? ['max'] : ['telegram'];
              failureIntents.push({
                type: 'message.send',
                meta: buildIntentMeta({ ...action, id: `${action.id}:channel-link-failed` }, ctx),
                payload: {
                  recipient: { chatId },
                  message: { text },
                  delivery: { channels, maxAttempts: 1 },
                },
              });
            }
          }
        }

        return {
          actionId: action.id,
          status: 'failed',
          error: errMsg,
          values: { channelLink: { ok: false, error: result.error } },
          ...(failureIntents.length > 0 ? { intents: failureIntents } : {}),
        };
      }
      const needsPhone = result.needsPhone === true;
      const phoneNormalized = asString(result.phoneNormalized);
      const messengerChannel = channelCode === 'max' ? 'max' : 'telegram';

      const syncWrites: DbWriteMutation[] = [];
      if (!needsPhone && phoneNormalized && fullDeps.writePort) {
        if (messengerChannel === 'telegram') {
          syncWrites.push({
            type: 'user.phone.link',
            params: {
              resource: 'telegram',
              channelUserId: externalId,
              phoneNormalized,
              ...(ctx.event.meta.correlationId
                ? { correlationId: ctx.event.meta.correlationId }
                : {}),
            },
          });
          syncWrites.push({
            type: 'user.state.set',
            params: { resource: 'telegram', channelUserId: externalId, state: 'idle' },
          });
        } else if (messengerChannel === 'max') {
          syncWrites.push({
            type: 'user.phone.link',
            params: {
              resource: 'max',
              channelUserId: externalId,
              phoneNormalized,
              ...(ctx.event.meta.correlationId
                ? { correlationId: ctx.event.meta.correlationId }
                : {}),
            },
          });
        }
      }
      const appliedChannelLinkWrites: DbWriteMutation[] = [];
      let phoneLinkSyncFailure:
        | { error: string; phoneLinkReason?: PhoneLinkFailureReason }
        | undefined;
      if (syncWrites.length > 0 && fullDeps.writePort) {
        for (const write of syncWrites) {
          const meta = await fullDeps.writePort.writeDb(write);
          appliedChannelLinkWrites.push(write);
          if (write.type === 'user.phone.link') {
            const hasMeta =
              typeof meta === 'object' && meta !== null && 'userPhoneLinkApplied' in meta;
            const m = hasMeta ? (meta as DbWriteDbResult) : null;
            const indeterminate = !hasMeta || m?.phoneLinkIndeterminate === true;
            const notApplied = hasMeta && m && !m.userPhoneLinkApplied;
            if (notApplied || indeterminate) {
              const reason = m?.phoneLinkReason;
              phoneLinkSyncFailure = {
                error:
                  reason !== undefined
                    ? `channel link phone sync: ${reason}`
                    : indeterminate
                      ? 'channel link phone sync: indeterminate'
                      : 'channel link phone sync: not applied',
                ...(reason !== undefined ? { phoneLinkReason: reason } : {}),
              };
              logger.warn(
                {
                  event: 'channel_link_phone_sync_failed',
                  externalId,
                  channelCode,
                  phoneLinkReason: reason,
                  indeterminate,
                },
                '[webapp.channelLink.complete] user.phone.link did not apply',
              );
              break;
            }
          }
        }
      }

      if (phoneLinkSyncFailure) {
        const failureIntents: OutgoingIntent[] = [];
        const tplPort = fullDeps.templatePort;
        const source = ctx.event.meta.source;
        if (tplPort && (source === 'telegram' || source === 'max')) {
          const chatId = resolveChannelLinkFailureChatId(ctx, externalId);
          if (chatId !== null) {
            const templateKey = channelLinkCompleteFailureTemplateKey(
              source,
              phoneLinkSyncFailure.phoneLinkReason ?? phoneLinkSyncFailure.error,
            );
            const text = await renderText({
              templateKey,
              ctx,
              templatePort: tplPort,
            });
            if (text.trim().length > 0) {
              const channels = source === 'max' ? ['max'] : ['telegram'];
              failureIntents.push({
                type: 'message.send',
                meta: buildIntentMeta(
                  { ...action, id: `${action.id}:channel-link-phone-sync-failed` },
                  ctx,
                ),
                payload: {
                  recipient: { chatId },
                  message: { text },
                  delivery: { channels, maxAttempts: 1 },
                },
              });
            }
          }
        }
        return {
          actionId: action.id,
          status: 'failed',
          error: phoneLinkSyncFailure.error,
          values: {
            channelLink: {
              /** Итог шага для планировщика: webapp complete прошёл, синк телефона в БД бота — нет. */
              ok: false,
              webappComplete: true,
              phoneLinkSync: { ok: false, reason: phoneLinkSyncFailure.phoneLinkReason },
            },
          },
          ...(failureIntents.length > 0 ? { intents: failureIntents } : {}),
          ...(appliedChannelLinkWrites.length > 0 ? { writes: appliedChannelLinkWrites } : {}),
        };
      }

      if (needsPhone && fullDeps.dispatchPort) {
        if (messengerChannel === 'telegram' && !fullDeps.writePort) {
          return {
            actionId: action.id,
            status: 'failed',
            error: 'webapp.channelLink.complete: writePort required for Telegram contact prompt',
            values: {
              channelLink: { ok: true, needsPhone: true, contactPrompt: 'skipped_no_write_port' },
            },
          };
        }
        try {
          await dispatchRequestContactToUser({
            dispatchPort: fullDeps.dispatchPort,
            ...(messengerChannel === 'telegram' ? { writePort: fullDeps.writePort } : {}),
            channel: messengerChannel,
            recipientId: externalId,
            correlationId: `channel-link:${messengerChannel}:${externalId}`,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            actionId: action.id,
            status: 'failed',
            error: `channel link contact prompt: ${msg}`,
            values: { channelLink: { ok: true, needsPhone: true, contactPromptError: msg } },
          };
        }
      }

      let intents: OutgoingIntent[] | undefined;
      if (!needsPhone && messengerChannel === 'telegram' && fullDeps.templatePort) {
        const rawChat = readIncomingChatId(ctx);
        const fromEvent = rawChat !== null ? Number(rawChat) : NaN;
        const chatId = Number.isFinite(fromEvent) ? fromEvent : Number(externalId);
        if (Number.isFinite(chatId)) {
          const welcomeAction: Action = {
            id: `${action.id}:after-phone-linked`,
            type: 'message.replyKeyboard.show',
            mode: 'async',
            params: {
              chatId,
              templateKey: 'telegram:afterPhoneLinked',
              keyboard: [[{ textTemplateKey: 'telegram:menu.book' }]],
              resizeKeyboard: true,
            },
          };
          const welcomeResult = await executeAction(welcomeAction, ctx, fullDeps);
          intents = welcomeResult.intents;
        }
      } else if (!needsPhone && messengerChannel === 'max' && fullDeps.templatePort) {
        const chatIdResolved = resolveChannelLinkFailureChatId(ctx, externalId);
        if (chatIdResolved !== null) {
          const text = await renderText({
            templateKey: 'max:afterChannelLinked',
            ctx,
            templatePort: fullDeps.templatePort,
          });
          if (text.trim().length > 0) {
            intents = [
              {
                type: 'message.send',
                meta: buildIntentMeta({ ...action, id: `${action.id}:after-channel-linked` }, ctx),
                payload: {
                  recipient: { chatId: chatIdResolved },
                  message: { text },
                  delivery: { channels: ['max'], maxAttempts: 1 },
                },
              },
            ];
          }
        }
      }

      return {
        actionId: action.id,
        status: 'success',
        values: { channelLink: { ok: true, needsPhone, contactPromptSent: needsPhone } },
        ...(appliedChannelLinkWrites.length > 0 ? { writes: appliedChannelLinkWrites } : {}),
        ...(intents !== undefined && intents.length > 0 ? { intents } : {}),
      };
    }

    case 'message.replyKeyboard.show':
    case 'message.inlineKeyboard.show': {
      const rawVars = (action.params.vars ?? {}) as Record<string, unknown>;
      const username = typeof rawVars.username === 'string' ? rawVars.username.trim() : '';
      const vars = {
        ...rawVars,
        usernameMention: username ? `@${username}` : '',
      };
      const expandedParams =
        action.type === 'message.inlineKeyboard.show'
          ? await expandContentMenuParam(action.params, ctx, fullDeps.contentPort)
          : action.params;
      const text = await renderText({
        text: expandedParams.text,
        messageText: expandedParams.messageText,
        templateKey: expandedParams.templateKey,
        vars,
        ctx,
        templatePort: deps.templatePort,
      });
      const replyMarkup = await buildReplyMarkup({
        params: expandedParams,
        vars: expandedParams.vars,
        ctx,
        templatePort: deps.templatePort,
      });
      const chatId = asNumber(expandedParams.chatId) ?? asString(expandedParams.chatId);
      const parseMode =
        action.params.parseMode === 'HTML' || action.params.parseMode === 'Markdown'
          ? action.params.parseMode
          : undefined;
      const intents: OutgoingIntent[] = [
        {
          type: 'message.send',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: chatId === null ? {} : { chatId },
            message: { text },
            ...(replyMarkup ? { replyMarkup } : {}),
            ...(parseMode ? { parse_mode: parseMode } : {}),
            delivery: { maxAttempts: 1 },
          },
        },
      ];
      return { actionId: action.id, status: 'success', intents };
    }

    case 'message.edit': {
      const expandedParams = await expandContentMenuParam(action.params, ctx, fullDeps.contentPort);
      const text = await renderText({
        text: expandedParams.text,
        messageText: expandedParams.messageText,
        templateKey: expandedParams.templateKey,
        vars: expandedParams.vars,
        ctx,
        templatePort: deps.templatePort,
      });
      const replyMarkup = await buildReplyMarkup({
        params: expandedParams,
        vars: expandedParams.vars,
        ctx,
        templatePort: deps.templatePort,
      });
      const chatId = asNumber(expandedParams.chatId) ?? asString(expandedParams.chatId);
      const messageId = asMessageId(action.params.messageId);
      const parseMode =
        action.params.parseMode === 'HTML' || action.params.parseMode === 'Markdown'
          ? action.params.parseMode
          : undefined;
      const intents: OutgoingIntent[] = [
        {
          type: 'message.edit',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: chatId === null ? {} : { chatId },
            ...(messageId === null ? {} : { messageId }),
            message: { text },
            ...(replyMarkup ? { replyMarkup } : {}),
            ...(parseMode ? { parse_mode: parseMode } : {}),
          },
        },
      ];
      return { actionId: action.id, status: 'success', intents };
    }

    case 'message.replyMarkup.edit': {
      const chatId = asNumber(action.params.chatId);
      const messageId = asMessageId(action.params.messageId);
      const replyMarkup = await buildReplyMarkup({
        params: action.params,
        vars: action.params.vars,
        ctx,
        templatePort: deps.templatePort,
      });
      const intents: OutgoingIntent[] = [
        {
          type: 'message.replyMarkup.edit',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: chatId === null ? {} : { chatId },
            ...(messageId === null ? {} : { messageId }),
            ...(replyMarkup ? { replyMarkup } : {}),
          },
        },
      ];
      return { actionId: action.id, status: 'success', intents };
    }

    case 'user.state.set': {
      const stateRaw = action.params.state;
      const stateStr = typeof stateRaw === 'string' ? stateRaw.trim() : '';
      if (!stateStr) {
        return { actionId: action.id, status: 'skipped', error: 'USER_STATE_EMPTY' };
      }
      const writes: DbWriteMutation[] = [
        {
          type: 'user.state.set',
          params: {
            resource: ctx.event.meta.source,
            channelUserId:
              action.params.channelUserId ?? action.params.channelId ?? readExternalActorId(ctx),
            state: stateStr,
          },
        },
      ];
      await persistWrites(deps.writePort, writes);
      return {
        actionId: action.id,
        status: 'success',
        writes,
        values: { userState: stateStr },
      };
    }

    case 'user.phone.link': {
      const channelUserId =
        action.params.channelUserId ?? action.params.channelId ?? readExternalActorId(ctx);
      const phoneNormalized = asString(action.params.phoneNormalized) ?? readIncomingPhone(ctx);
      if (!phoneNormalized || !deps.writePort) {
        return {
          actionId: action.id,
          status: 'skipped',
          error: 'PHONE_LINK_INPUT_MISSING',
        };
      }
      const write: DbWriteMutation = {
        type: 'user.phone.link',
        params: {
          resource: ctx.event.meta.source,
          channelUserId,
          phoneNormalized,
          ...(ctx.event.meta.correlationId ? { correlationId: ctx.event.meta.correlationId } : {}),
        },
      };
      const meta = await deps.writePort.writeDb(write);
      const hasMeta = typeof meta === 'object' && meta !== null && 'userPhoneLinkApplied' in meta;
      if (!hasMeta) {
        logger.warn(
          { actionId: action.id },
          'user.phone.link: writeDb missing userPhoneLinkApplied',
        );
      }
      const m = hasMeta ? (meta as DbWriteDbResult) : null;
      const indeterminate = !hasMeta || m?.phoneLinkIndeterminate === true;
      const notApplied = hasMeta && m && !m.userPhoneLinkApplied;

      if (notApplied || indeterminate) {
        const chatIdStr = readIncomingChatId(ctx);
        const chatIdParsed = chatIdStr != null ? Number(chatIdStr) : NaN;
        const source = ctx.event.meta.source ?? 'telegram';
        const reason = m?.phoneLinkReason;
        let text: string;
        if (reason === 'no_channel_binding') {
          text = phoneLinkNoBindingUserMessage(source);
        } else if (reason === 'no_integrator_identity') {
          text = phoneLinkNoIntegratorIdentityUserMessage(source);
        } else if (reason === 'phone_owned_by_other_user') {
          text = phoneLinkConflictUserMessage(source);
        } else if (reason === 'integrator_id_mismatch') {
          text = phoneLinkIntegratorMismatchUserMessage(source);
        } else if (
          reason === 'merge_blocked_booking_overlap' ||
          reason === 'merge_blocked_distinct_real_users' ||
          reason === 'merge_blocked_lfk_conflict' ||
          reason === 'merge_blocked_ambiguous_candidates' ||
          reason === 'merge_blocked_integrator_conflict'
        ) {
          text = phoneLinkMergeBlockedUserMessage(source);
        } else if (reason === 'channel_already_bound_to_other_user') {
          text = phoneLinkChannelBoundElsewhereUserMessage(source);
        } else if (reason === 'legacy_contacts_conflict') {
          text = phoneLinkLegacyContactsConflictUserMessage();
        } else if (reason === 'db_transient_failure' || indeterminate) {
          text = phoneLinkSaveFailedUserMessage();
        } else {
          logger.warn(
            { actionId: action.id, reason },
            'user.phone.link: unexpected phoneLinkReason for failed bind; using save-failed copy',
          );
          text = phoneLinkSaveFailedUserMessage();
        }
        const intents: OutgoingIntent[] = [
          {
            type: 'message.send',
            meta: buildIntentMeta(action, ctx),
            payload: {
              recipient:
                chatIdStr != null && Number.isFinite(chatIdParsed)
                  ? { chatId: chatIdParsed }
                  : { chatId: chatIdStr ?? undefined },
              message: { text },
              delivery: { channels: [source], maxAttempts: 1 },
            },
          },
        ];
        return {
          actionId: action.id,
          status: 'success',
          abortPlan: true,
          intents,
        };
      }

      return {
        actionId: action.id,
        status: 'success',
        writes: [write],
      };
    }

    case 'draft.upsertFromMessage':
    case 'draft.replaceFromMessage': {
      const externalId = readExternalActorId(ctx);
      const draftTextCurrent = asString(action.params.text) ?? readIncomingText(ctx);
      const source = asString(action.params.source) ?? ctx.event.meta.source;
      if (!externalId || !draftTextCurrent || !source) {
        return {
          actionId: action.id,
          status: 'skipped',
          error: 'DRAFT_INPUT_MISSING',
        };
      }
      const writes: DbWriteMutation[] = [
        {
          type: 'draft.upsert',
          params: {
            id: randomUUID(),
            resource: ctx.event.meta.source,
            externalId,
            source,
            externalChatId: readIncomingChatId(ctx),
            externalMessageId: readIncomingMessageId(ctx),
            draftTextCurrent,
            state: 'pending_confirmation',
          },
        },
      ];
      await persistWrites(deps.writePort, writes);
      return {
        actionId: action.id,
        status: 'success',
        writes,
        values: {
          draftState: 'pending_confirmation',
          draftTextCurrent,
          draftSourceMessageId: readIncomingMessageId(ctx) ?? undefined,
          hasActiveDraft: true,
        },
      };
    }

    case 'draft.cancel': {
      const externalId = readExternalActorId(ctx);
      const source = asString(action.params.source) ?? ctx.event.meta.source;
      if (!externalId || !source) {
        return {
          actionId: action.id,
          status: 'skipped',
          error: 'DRAFT_CANCEL_INPUT_MISSING',
        };
      }
      const writes: DbWriteMutation[] = [
        {
          type: 'draft.cancel',
          params: {
            resource: ctx.event.meta.source,
            externalId,
            source,
          },
        },
      ];
      await persistWrites(deps.writePort, writes);
      return {
        actionId: action.id,
        status: 'success',
        writes,
        values: {
          hasActiveDraft: false,
          draftState: undefined,
          draftTextCurrent: undefined,
          draftSourceMessageId: undefined,
        },
      };
    }

    case 'draft.send': {
      const externalId = readExternalActorId(ctx);
      const source = asString(action.params.source) ?? ctx.event.meta.source;
      if (!deps.readPort || !externalId || !source) {
        return {
          actionId: action.id,
          status: 'skipped',
          error: 'DRAFT_SEND_INPUT_MISSING',
        };
      }
      const draft = await deps.readPort.readDb<Record<string, unknown> | null>({
        type: 'draft.activeByIdentity',
        params: {
          resource: ctx.event.meta.source,
          externalId,
          source,
        },
      });
      if (!draft) {
        return {
          actionId: action.id,
          status: 'skipped',
          error: 'DRAFT_NOT_FOUND',
        };
      }

      const draftTextCurrent = asString(draft.draft_text_current);
      const userChannelId = asString(draft.channel_id);
      const adminChatId = asNumber(asRecord(ctx.base.facts).adminChatId);
      if (!draftTextCurrent || !userChannelId || adminChatId === null) {
        return {
          actionId: action.id,
          status: 'skipped',
          error: 'DRAFT_SEND_CONTEXT_MISSING',
        };
      }

      const openConversation = await deps.readPort.readDb<Record<string, unknown> | null>({
        type: 'conversation.openByIdentity',
        params: {
          resource: ctx.event.meta.source,
          externalId,
          source,
        },
      });
      const openConversationId = asString(openConversation?.id);
      if (openConversationId) {
        const cancelWrite: DbWriteMutation = {
          type: 'draft.cancel',
          params: {
            resource: ctx.event.meta.source,
            externalId,
            source,
          },
        };
        await persistWrites(deps.writePort, [cancelWrite]);
        const relayAction: Action = {
          id: action.id,
          type: 'conversation.user.message',
          mode: action.mode,
          params: {
            source,
            text: draftTextCurrent,
            externalChatId: asString(draft.external_chat_id) ?? undefined,
            externalMessageId: asString(draft.external_message_id) ?? undefined,
          },
        };
        const relayResult = await handleConversationUserMessage(relayAction, ctx, fullDeps);
        return {
          ...relayResult,
          actionId: action.id,
          writes: [cancelWrite, ...(relayResult.writes ?? [])],
          values: {
            ...relayResult.values,
            hasActiveDraft: false,
          },
        };
      }

      const conversationId = randomUUID();
      const firstMessageId = randomUUID();
      const questionId = randomUUID();
      const firstQuestionMessageId = randomUUID();
      let userIdentityId = asString(draft.identity_id);
      if (!userIdentityId && deps.readPort) {
        const resolvedId = await deps.readPort.readDb<string | null>({
          type: 'identity.idByResourceAndExternalId',
          params: { resource: ctx.event.meta.source, externalId: userChannelId },
        });
        userIdentityId = asString(resolvedId) ?? '';
      }
      const writes: DbWriteMutation[] = [
        {
          type: 'conversation.open',
          params: {
            id: conversationId,
            resource: ctx.event.meta.source,
            externalId,
            source,
            adminScope: asString(action.params.adminScope) ?? 'default',
            status: 'waiting_admin',
            openedAt: ctx.nowIso,
            lastMessageAt: ctx.nowIso,
          },
        },
        {
          type: 'conversation.message.add',
          params: {
            id: firstMessageId,
            conversationId,
            senderRole: 'user',
            text: draftTextCurrent,
            source,
            externalChatId: asString(draft.external_chat_id),
            externalMessageId: asString(draft.external_message_id),
            createdAt: ctx.nowIso,
          },
        },
        ...(userIdentityId
          ? [
              {
                type: 'question.create' as const,
                params: {
                  id: questionId,
                  userIdentityId,
                  conversationId,
                  telegramMessageId: asString(draft.external_message_id),
                  text: draftTextCurrent,
                  createdAt: ctx.nowIso,
                },
              },
              {
                type: 'question.message.add' as const,
                params: {
                  id: firstQuestionMessageId,
                  questionId,
                  senderType: 'user',
                  messageText: draftTextCurrent,
                  createdAt: ctx.nowIso,
                },
              },
            ]
          : []),
        {
          type: 'draft.cancel',
          params: {
            resource: ctx.event.meta.source,
            externalId,
            source,
          },
        },
      ];
      await persistWrites(deps.writePort, writes);

      const intents = await buildDoctorPatientMessageNotificationIntents({
        action,
        ctx,
        deps: fullDeps,
        source,
        externalId,
        conversationId,
        integratorMessageId: firstMessageId,
        messageText: draftTextCurrent,
        firstName: asString(draft.first_name),
        lastName: asString(draft.last_name),
        username: asString(draft.username),
        channelId: userChannelId,
      });
      return {
        actionId: action.id,
        status: 'success',
        writes,
        intents,
        values: {
          hasActiveDraft: false,
          hasOpenConversation: true,
          activeConversationId: conversationId,
          activeConversationStatus: 'waiting_admin',
        },
      };
    }

    case 'conversation.user.message': {
      return handleConversationUserMessage(action, ctx, fullDeps);
    }

    case 'conversation.admin.reply': {
      return handleConversationAdminReply(action, ctx, fullDeps);
    }

    case 'conversation.close': {
      if (!deps.readPort) {
        return { actionId: action.id, status: 'skipped', error: 'READ_PORT_REQUIRED' };
      }
      const conversationId = readConversationId(action, ctx);
      if (!conversationId) {
        return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_ID_MISSING' };
      }
      const writes: DbWriteMutation[] = [
        {
          type: 'conversation.state.set',
          params: {
            id: conversationId,
            status: 'closed',
            lastMessageAt: ctx.nowIso,
            closedAt: ctx.nowIso,
            closeReason: asString(action.params.closeReason) ?? 'admin_closed',
          },
        },
      ];
      await persistWrites(deps.writePort, writes);
      const intents: OutgoingIntent[] = [];
      const adminClosedText = deps.templatePort
        ? (await renderText({
            templateKey: ADMIN.DIALOG_CLOSED,
            ctx,
            templatePort: deps.templatePort,
          })) || 'Диалог завершён.'
        : 'Диалог завершён.';
      intents.push(sendAdminMessage({ action, ctx, text: adminClosedText }));
      return {
        actionId: action.id,
        status: 'success',
        writes,
        ...(intents.length > 0 ? { intents } : {}),
      };
    }

    case 'conversation.listOpen': {
      if (!deps.readPort) {
        return { actionId: action.id, status: 'skipped', error: 'READ_PORT_REQUIRED' };
      }
      const items = await deps.readPort.readDb<Array<Record<string, unknown>>>({
        type: 'conversation.listOpen',
        params: {
          source: asString(action.params.source) ?? ctx.event.meta.source,
          limit: asNumber(action.params.limit) ?? 10,
        },
      });
      const adminChatId = asNumber(readIncoming(ctx).chatId);
      if (adminChatId === null) {
        return { actionId: action.id, status: 'skipped', error: 'ADMIN_CHAT_ID_MISSING' };
      }
      const rows = Array.isArray(items) ? items : [];
      const listBody = rows
        .map((item, index) => {
          const label = formatActorLabel({
            firstName: asString(item.first_name),
            lastName: asString(item.last_name),
            username: asString(item.username),
            channelId: asString(item.user_channel_id),
          });
          const status = asString(item.status) ?? 'open';
          return `${index + 1}. ${label} [${status}]`;
        })
        .join('\n');
      const text =
        rows.length === 0
          ? deps.templatePort
            ? (await renderText({
                templateKey: ADMIN.DIALOGS_EMPTY,
                ctx,
                templatePort: deps.templatePort,
              })) || 'Открытых диалогов нет.'
            : 'Открытых диалогов нет.'
          : deps.templatePort
            ? (await renderText({
                templateKey: ADMIN.DIALOGS_LIST,
                vars: { listBody },
                ctx,
                templatePort: deps.templatePort,
              })) || `Открытые диалоги:\n\n${listBody}`
            : `Открытые диалоги:\n\n${listBody}`;
      const inline_keyboard = rows.slice(0, 10).map((item) => [
        {
          text: formatActorLabel({
            firstName: asString(item.first_name),
            lastName: asString(item.last_name),
            username: asString(item.username),
            channelId: asString(item.user_channel_id),
          }),
          callback_data: `dialogs.view:${asString(item.id)}`,
        },
      ]);
      const intents: OutgoingIntent[] = [
        {
          type: 'message.send',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: { chatId: adminChatId },
            message: { text },
            ...(inline_keyboard.length > 0 ? { replyMarkup: { inline_keyboard } } : {}),
            delivery: { maxAttempts: 1 },
          },
        },
      ];
      return { actionId: action.id, status: 'success', intents };
    }

    case 'question.listUnanswered': {
      if (!deps.readPort) {
        return { actionId: action.id, status: 'skipped', error: 'READ_PORT_REQUIRED' };
      }
      const items = await deps.readPort.readDb<Array<Record<string, unknown>>>({
        type: 'questions.unanswered',
        params: { limit: asNumber(action.params.limit) ?? 20 },
      });
      const adminChatId = asNumber(readIncoming(ctx).chatId);
      if (adminChatId === null) {
        return { actionId: action.id, status: 'skipped', error: 'ADMIN_CHAT_ID_MISSING' };
      }
      const rows = Array.isArray(items) ? items : [];
      const listBodyUnanswered = rows
        .map((item, index) => {
          const label = formatActorLabel({
            firstName: asString(item.first_name),
            lastName: asString(item.last_name),
            username: asString(item.username),
            channelId: asString(item.user_channel_id),
          });
          const excerpt = (asString(item.text) ?? '').slice(0, 80);
          return `${index + 1}. ${label}\n   ${excerpt}${(asString(item.text) ?? '').length > 80 ? '…' : ''}`;
        })
        .join('\n\n');
      const text =
        rows.length === 0
          ? deps.templatePort
            ? (await renderText({
                templateKey: ADMIN.QUESTIONS_EMPTY,
                ctx,
                templatePort: deps.templatePort,
              })) || 'Неотвеченных вопросов нет.'
            : 'Неотвеченных вопросов нет.'
          : deps.templatePort
            ? (await renderText({
                templateKey: ADMIN.QUESTIONS_LIST,
                vars: { count: rows.length, listBody: listBodyUnanswered },
                ctx,
                templatePort: deps.templatePort,
              })) || `Неотвеченные вопросы (${rows.length}):\n\n${listBodyUnanswered}`
            : `Неотвеченные вопросы (${rows.length}):\n\n${listBodyUnanswered}`;
      const filteredRows = rows.filter((item) => asString(item.conversation_id)).slice(0, 15);
      const inline_keyboard = deps.templatePort
        ? await Promise.all(
            filteredRows.map(async (item) => {
              const label = formatActorLabel({
                firstName: asString(item.first_name),
                lastName: asString(item.last_name),
                username: asString(item.username),
                channelId: asString(item.user_channel_id),
              });
              const btnText =
                (await renderText({
                  templateKey: ADMIN.QUESTIONS_REPLY_BUTTON,
                  vars: { label },
                  ctx,
                  templatePort: deps.templatePort,
                })) || `Ответить: ${label}`;
              return [
                { text: btnText, callback_data: `admin_reply:${asString(item.conversation_id)}` },
              ];
            }),
          )
        : filteredRows.map((item) => [
            {
              text: `Ответить: ${formatActorLabel({
                firstName: asString(item.first_name),
                lastName: asString(item.last_name),
                username: asString(item.username),
                channelId: asString(item.user_channel_id),
              })}`,
              callback_data: `admin_reply:${asString(item.conversation_id)}`,
            },
          ]);
      const inlineRows: Array<Array<{ text: string; callback_data: string }>> = [
        ...inline_keyboard,
      ];
      if (rows.length > 0) {
        const markAllLabel = deps.templatePort
          ? (
              await renderText({
                templateKey: ADMIN.QUESTIONS_MARK_ALL_BUTTON,
                ctx,
                templatePort: deps.templatePort,
              })
            )?.trim() || 'Пометить все как отвеченные'
          : 'Пометить все как отвеченные';
        inlineRows.push([{ text: markAllLabel, callback_data: 'questions.mark_all_answered' }]);
      }
      const intents: OutgoingIntent[] = [
        {
          type: 'message.send',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: { chatId: adminChatId },
            message: { text },
            ...(inlineRows.length > 0 ? { replyMarkup: { inline_keyboard: inlineRows } } : {}),
            delivery: { maxAttempts: 1 },
          },
        },
      ];
      return { actionId: action.id, status: 'success', intents };
    }

    /**
     * «Все» = неотвеченные в той же выборке, что и ветка `question.listUnanswered`: один read
     * `questions.unanswered` с тем же `limit` (по умолчанию 20), затем по каждой строке с непустым `id`
     * — мутация `question.markAnswered` (как при одиночной пометке), не только строки с инлайн «Ответить» (до 15).
     */
    case 'question.markAllUnansweredAnswered': {
      if (!deps.readPort) {
        return { actionId: action.id, status: 'skipped', error: 'READ_PORT_REQUIRED' };
      }
      if (!deps.writePort) {
        return { actionId: action.id, status: 'skipped', error: 'WRITE_PORT_REQUIRED' };
      }
      const limit = asNumber(action.params.limit) ?? 20;
      const items = await deps.readPort.readDb<Array<Record<string, unknown>>>({
        type: 'questions.unanswered',
        params: { limit },
      });
      const rows = Array.isArray(items) ? items : [];
      const writes: DbWriteMutation[] = [];
      for (const item of rows) {
        const questionId = asString(item.id)?.trim();
        if (!questionId) continue;
        writes.push({
          type: 'question.markAnswered',
          params: { questionId, answeredAt: ctx.nowIso },
        });
      }
      if (writes.length > 0) {
        await persistWrites(deps.writePort, writes);
      }
      return {
        actionId: action.id,
        status: 'success',
        values: { markedCount: writes.length },
        ...(writes.length > 0 ? { writes } : {}),
      };
    }

    case 'conversation.show': {
      if (!deps.readPort) {
        return { actionId: action.id, status: 'skipped', error: 'READ_PORT_REQUIRED' };
      }
      const conversationId = readConversationId(action, ctx);
      const adminChatId = asNumber(readIncoming(ctx).chatId);
      if (!conversationId || adminChatId === null) {
        return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_SHOW_INPUT_MISSING' };
      }
      const conversation = await deps.readPort.readDb<Record<string, unknown> | null>({
        type: 'conversation.byId',
        params: { id: conversationId },
      });
      if (!conversation) {
        return { actionId: action.id, status: 'skipped', error: 'CONVERSATION_NOT_FOUND' };
      }
      const label = formatActorLabel({
        firstName: asString(conversation.first_name),
        lastName: asString(conversation.last_name),
        username: asString(conversation.username),
        channelId: asString(conversation.user_channel_id),
      });
      const status = asString(conversation.status) ?? 'open';
      const showText = deps.templatePort
        ? (await renderText({
            templateKey: ADMIN.CONVERSATION_SHOW,
            vars: { label, status },
            ctx,
            templatePort: deps.templatePort,
          })) || `Диалог\nПользователь: ${label}\nСтатус: ${status}`
        : `Диалог\nПользователь: ${label}\nСтатус: ${status}`;
      const replyBtnText = deps.templatePort
        ? (await renderText({
            templateKey: ADMIN.REPLY_BUTTON,
            ctx,
            templatePort: deps.templatePort,
          })) || 'Ответить'
        : 'Ответить';
      const closeBtnText = deps.templatePort
        ? ((
            await renderText({
              templateKey: ADMIN.DIALOG_CLOSE_BUTTON,
              ctx,
              templatePort: deps.templatePort,
            })
          )?.trim() ?? '')
        : '';
      const rows: Array<Array<{ text: string; callback_data: string }>> = [
        [{ text: replyBtnText, callback_data: `admin_reply:${conversationId}` }],
      ];
      if (closeBtnText) {
        rows.push([{ text: closeBtnText, callback_data: `admin_close_dialog:${conversationId}` }]);
      }
      const intents: OutgoingIntent[] = [
        {
          type: 'message.send',
          meta: buildIntentMeta(action, ctx),
          payload: {
            recipient: { chatId: adminChatId },
            message: { text: showText },
            replyMarkup: { inline_keyboard: rows },
            delivery: { maxAttempts: 1 },
          },
        },
      ];
      return { actionId: action.id, status: 'success', intents };
    }

    default:
      return {
        actionId: action.id,
        status: 'skipped',
        error: `ACTION_NOT_IMPLEMENTED:${action.type}`,
      };
  }
}
