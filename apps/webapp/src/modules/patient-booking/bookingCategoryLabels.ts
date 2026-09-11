import type { PatientBookingRecord } from './types';

/**
 * Человеческое имя онлайн-приёма по внутреннему ключу категории.
 *
 * Живёт здесь, а не в папке экрана, потому что теперь этим именем пользуются ДВА потребителя:
 * карточка записи в кабинете и текст сообщения об оплате. Раньше правило стояло только в
 * `app/app/patient/cabinet/patientBookingLabels.ts`, а текст сообщения подставлял сырой ключ —
 * независимый аудит S8 прочитал в письме «rehab_lfk» вместо «Реабилитация (ЛФК)». Второго правила
 * не заводим: у имени услуги один источник.
 */
export function onlineBookingCategoryLabel(category: PatientBookingRecord['category']): string {
  if (category === 'rehab_lfk') return 'Реабилитация (ЛФК)';
  if (category === 'nutrition') return 'Нутрициология';
  return 'Онлайн консультация';
}

/**
 * Имя услуги для строки записи в сообщении: снимок услуги, а для онлайн-приёма — человеческое имя
 * категории. `null` означает «назвать нечем», и вызывающий ставит своё общее слово; сырой
 * внутренний ключ не возвращается никогда.
 */
export function bookingServiceTitleForMessage(
  row: Pick<PatientBookingRecord, 'serviceTitleSnapshot' | 'bookingType' | 'category'>,
): string | null {
  const snapshot = row.serviceTitleSnapshot?.trim();
  if (snapshot) return snapshot;
  if (row.bookingType === 'online') return onlineBookingCategoryLabel(row.category);
  return null;
}
