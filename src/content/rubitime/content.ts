/** Тексты и шаблоны Rubitime. */

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Коды статусов Rubitime записи. */
export const rubitimeBookingStatuses = {
  accepted: 0,
  in_progress: 1,
  completed: 2,
  waiting_for_payment: 3,
  canceled: 4,
  waiting_for_confirmation: 5,
  in_cart: 6,
  moved: 7,
} as const;

function formatRubitimeRecordAt(value: string | null): { date: string; time: string } {
  if (!value) return { date: 'неизвестная дата', time: 'неизвестное время' };
  const normalized = value.trim().replace('T', ' ');
  const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/.exec(normalized);
  if (!match) return { date: value, time: '' };
  const year = match[1] ?? '';
  const month = match[2] ?? '';
  const day = match[3] ?? '';
  const hours = match[4] ?? '';
  const minutes = match[5] ?? '';
  return {
    date: `${day}.${month}.${year.slice(2)}`,
    time: `${hours}:${minutes}`,
  };
}

export const rubitimeContent = {
  messages: {
    bookingAccepted(input: { recordAt: string | null }): string {
      const { date, time } = formatRubitimeRecordAt(input.recordAt);
      return `Вы записаны к Дмитрию на прием ${date} в ${time}`;
    },
    bookingCanceled(input: { recordAt: string | null }): string {
      const { date, time } = formatRubitimeRecordAt(input.recordAt);
      return `Отменена ваша запись на прием ${date} в ${time}`;
    },
    bookingMoved(input: { comment: string | null }): string {
      const comment = input.comment?.trim() ? input.comment.trim() : '—';
      return `Запрос на перенос записи получен и ожидает подтверждения. Ваш комментарий: ${comment}`;
    },
  },
  iframe: {
    buttonLabel: 'Получать напоминания в телеграм',
    deepLinkBase: 'https://t.me/bersoncarebot?start=',
  },
} as const;

export function renderRubitimeIframeHtml(showButton: boolean, recordId: string): string {
  if (!showButton) return '';
  const safeRecordId = escapeHtml(recordId);
  const deepLink = `${rubitimeContent.iframe.deepLinkBase}${encodeURIComponent(recordId)}`;
  return `<div id="success_info_container"><a href="${deepLink}" data-record-id="${safeRecordId}"><button type="button" id="tgbot_activate" name="bersontgbot" class="base-type btn">${rubitimeContent.iframe.buttonLabel}</button></a></div>`;
}
