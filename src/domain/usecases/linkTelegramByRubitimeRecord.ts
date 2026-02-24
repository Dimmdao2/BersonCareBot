import { normalizePhone } from '../phone.js';
import type { OutgoingAction } from '../types.js';

type RubitimeRecordForLinking = {
  rubitimeRecordId: string;
  phoneNormalized: string | null;
  payloadJson: unknown;
  recordAt: Date | null;
  status: 'created' | 'updated' | 'canceled';
};

type TelegramUserByPhone = {
  chatId: number;
  telegramId: string;
  username: string | null;
};

type TelegramUserLinkRow = {
  chatId: number;
  telegramId: string;
  username: string | null;
  phoneNormalized: string | null;
};

type LinkInput = {
  telegramId: string;
  chatId: number;
  username?: string | null | undefined;
  rubitimeRecordId: string;
  contactPhone: string;
};

type LinkDeps = {
  adminTelegramId: string;
  getRecordByRubitimeId: (rubitimeRecordId: string) => Promise<RubitimeRecordForLinking | null>;
  findTelegramUserByPhone: (phoneNormalized: string) => Promise<TelegramUserByPhone | null>;
  getTelegramUserLinkData: (telegramId: string) => Promise<TelegramUserLinkRow | null>;
  setTelegramUserPhone: (telegramId: string, phoneNormalized: string) => Promise<void>;
  setTelegramUserState: (telegramId: string, state: string | null) => Promise<void>;
};

function payloadSummary(record: RubitimeRecordForLinking): string {
  if (typeof record.payloadJson !== 'object' || record.payloadJson === null) {
    return `recordAt=${record.recordAt?.toISOString() ?? '-'} status=${record.status}`;
  }
  const payload = record.payloadJson as Record<string, unknown>;
  const name = payload.name;
  const service = payload.service;
  const recordAt = payload.record;
  return `recordAt=${String(recordAt ?? record.recordAt?.toISOString() ?? '-')} service=${String(service ?? '-')} name=${String(name ?? '-')}`;
}

export async function linkTelegramByRubitimeRecord(
  input: LinkInput,
  deps: LinkDeps,
): Promise<OutgoingAction[]> {
  const actions: OutgoingAction[] = [];
  const adminChatId = Number(deps.adminTelegramId);
  const contactPhoneNormalized = normalizePhone(input.contactPhone);

  const notifyAdmin = (text: string) => {
    if (Number.isFinite(adminChatId)) {
      actions.push({ type: 'sendMessage', chatId: adminChatId, text });
    }
  };

  if (!contactPhoneNormalized) {
    await deps.setTelegramUserState(input.telegramId, 'idle');
    actions.push({
      type: 'sendMessage',
      chatId: input.chatId,
      text: 'Не удалось распознать номер телефона. Попробуйте ещё раз.',
    });
    notifyAdmin(
      [
        'Linking rejected: invalid contact phone',
        `rubitime_record_id=${input.rubitimeRecordId}`,
        `telegram_id=${input.telegramId}`,
        `chat_id=${input.chatId}`,
        `username=${input.username ?? '-'}`,
      ].join('\n'),
    );
    return actions;
  }

  const record = await deps.getRecordByRubitimeId(input.rubitimeRecordId);
  if (!record) {
    await deps.setTelegramUserState(input.telegramId, 'idle');
    actions.push({
      type: 'sendMessage',
      chatId: input.chatId,
      text: 'Запись не найдена или уже устарела.',
    });
    notifyAdmin(
      [
        'Linking failed: record not found',
        `rubitime_record_id=${input.rubitimeRecordId}`,
        `telegram_id=${input.telegramId}`,
        `chat_id=${input.chatId}`,
        `username=${input.username ?? '-'}`,
      ].join('\n'),
    );
    return actions;
  }

  if (!record.phoneNormalized || record.phoneNormalized !== contactPhoneNormalized) {
    await deps.setTelegramUserState(input.telegramId, 'idle');
    actions.push({
      type: 'sendMessage',
      chatId: input.chatId,
      text: 'Не удалось подтвердить привязку: номер телефона не совпадает с записью.',
    });
    notifyAdmin(
      [
        'Linking rejected: phone mismatch',
        `rubitime_record_id=${record.rubitimeRecordId}`,
        `phone_record=${record.phoneNormalized ?? '-'}`,
        `phone_contact=${contactPhoneNormalized}`,
        payloadSummary(record),
        `telegram_id=${input.telegramId}`,
        `chat_id=${input.chatId}`,
        `username=${input.username ?? '-'}`,
      ].join('\n'),
    );
    return actions;
  }

  const existingByPhone = await deps.findTelegramUserByPhone(contactPhoneNormalized);
  if (existingByPhone && existingByPhone.telegramId !== input.telegramId) {
    await deps.setTelegramUserState(input.telegramId, 'idle');
    actions.push({
      type: 'sendMessage',
      chatId: input.chatId,
      text: 'Этот номер уже привязан к другому Telegram аккаунту.',
    });
    notifyAdmin(
      [
        'Linking rejected: phone already linked to other telegram_id',
        `rubitime_record_id=${record.rubitimeRecordId}`,
        `phone=${contactPhoneNormalized}`,
        `existing_telegram_id=${existingByPhone.telegramId}`,
        `requested_telegram_id=${input.telegramId}`,
        `chat_id=${input.chatId}`,
        `username=${input.username ?? '-'}`,
      ].join('\n'),
    );
    return actions;
  }

  const currentUser = await deps.getTelegramUserLinkData(input.telegramId);
  if (currentUser?.phoneNormalized && currentUser.phoneNormalized !== contactPhoneNormalized) {
    await deps.setTelegramUserState(input.telegramId, 'idle');
    actions.push({
      type: 'sendMessage',
      chatId: input.chatId,
      text: 'У вашего аккаунта уже привязан другой номер. Обратитесь в поддержку.',
    });
    notifyAdmin(
      [
        'Linking rejected: telegram user already has different phone',
        `rubitime_record_id=${record.rubitimeRecordId}`,
        `current_phone=${currentUser.phoneNormalized}`,
        `requested_phone=${contactPhoneNormalized}`,
        `telegram_id=${input.telegramId}`,
        `chat_id=${input.chatId}`,
        `username=${input.username ?? '-'}`,
      ].join('\n'),
    );
    return actions;
  }

  await deps.setTelegramUserPhone(input.telegramId, contactPhoneNormalized);
  await deps.setTelegramUserState(input.telegramId, 'idle');

  actions.push({
    type: 'sendMessage',
    chatId: input.chatId,
    text: 'Уведомления включены. Теперь вы будете получать сообщения по вашей записи.',
  });

  return actions;
}
