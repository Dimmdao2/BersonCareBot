/** Тексты и шаблоны Rubitime. */

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export const rubitimeContent = {
  messages: {
    bookingUpdateAccepted: 'Обновление по вашей записи принято.',
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
