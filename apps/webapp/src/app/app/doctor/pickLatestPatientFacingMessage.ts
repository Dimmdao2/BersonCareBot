import type { ProgramItemDiscussionMessage } from '@/modules/program-item-discussion/types';

/**
 * Сколько последних сообщений треда просматриваем, чтобы найти последний комментарий пациента.
 * Совпадает с размером страницы самой модалки обсуждения.
 */
export const DISCUSSION_LATEST_MESSAGE_SCAN_LIMIT = 50;

/**
 * Текст строки списка — последний комментарий ПАЦИЕНТА в просмотренном окне треда; ответы врача
 * после него не заменяют его в превью. Если в окне одни ответы врача, показываем последнее
 * сообщение треда, а не прячем упражнение: попадание в список решает счётчик, а не роль автора.
 *
 * Один и тот же выбор обслуживает KPI «Сегодня» и модалку «Комментарии к ЛФК».
 */
export function pickLatestPatientFacingMessage(
  page: readonly ProgramItemDiscussionMessage[],
): ProgramItemDiscussionMessage | null {
  let latestFromPatient: ProgramItemDiscussionMessage | null = null;
  for (const message of page) {
    if (message.senderRole === 'patient') latestFromPatient = message;
  }
  return latestFromPatient ?? page[page.length - 1] ?? null;
}
