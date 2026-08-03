import type { Action, ActionResult, DomainContext } from '../../../contracts/index.js';
import type { ExecutorDeps } from '../helpers.js';
import {
  asNumber,
  asNumericString,
  asString,
  asMessageId,
  buildIntentMeta,
  readExternalActorId,
  readIncoming,
} from '../helpers.js';
import {
  buildReminderSnoozeMenuInlineKeyboard,
  buildReminderNotifSettingsInlineKeyboard,
  reminderLinkKeyboardButton,
} from '../../reminders/reminderInlineKeyboard.js';
import type { InlineKeyboardButton } from '../../reminders/reminderInlineKeyboard.js';
import { env } from '../../../../config/env.js';

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
