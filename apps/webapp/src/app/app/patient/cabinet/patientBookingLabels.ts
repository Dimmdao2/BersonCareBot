import type { PatientBookingRecord } from '@/modules/patient-booking/types';
import { onlineBookingCategoryLabel } from '@/modules/patient-booking/bookingCategoryLabels';
import {
  appointmentDeliveryFormatLabels,
  type AppointmentTerms,
} from '@/modules/system-settings/patientTerms';
import { SCHEDULE_RECORD_PROVENANCE_PREFIX } from '@/shared/lib/scheduleRecordProvenance';

export { SCHEDULE_RECORD_PROVENANCE_PREFIX };

/** Retained call-site helper; canonical booking cards have no external provenance prefix. */
export function bookingProvenancePrefix(_row: PatientBookingRecord): string {
  return '';
}

/**
 * Subtitle under datetime for native booking cards (active + history).
 *
 * `terms` — слово организации о событии записи. Приходит явным аргументом от того, кто рисует
 * карточку: этот модуль общий для кабинета и истории, контекста у него нет, а необязательный
 * параметр молча оставил бы экран на «приёме» при зелёном `tsc` (закрывающий гейт T-G плана).
 */
export function nativeBookingSubtitle(
  row: PatientBookingRecord,
  terms: Pick<AppointmentTerms, 'appointmentGender' | 'appointmentSingular'>,
): string {
  if (row.bookingType === 'online') {
    const label = onlineBookingCategoryLabel(row.category);
    return label === 'Онлайн консультация' ? label : `Онлайн - ${label}`;
  }
  const canonical = row.canonicalInPersonContext;
  if (canonical) {
    const city =
      canonical.cityCode === 'moscow'
        ? 'Москва'
        : canonical.cityCode === 'spb'
          ? 'СПб'
          : canonical.cityCode;
    const place = city ? `${city} · ` : '';
    return `${appointmentDeliveryFormatLabels(terms).in_person} — ${place}${canonical.serviceTitle}`;
  }
  return appointmentDeliveryFormatLabels(terms).in_person;
}
