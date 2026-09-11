import type { PatientBookingRecord } from '@/modules/patient-booking/types';
import { onlineBookingCategoryLabel } from '@/modules/patient-booking/bookingCategoryLabels';
import { SCHEDULE_RECORD_PROVENANCE_PREFIX } from '@/shared/lib/scheduleRecordProvenance';

export { SCHEDULE_RECORD_PROVENANCE_PREFIX };

/** Retained call-site helper; canonical booking cards have no external provenance prefix. */
export function bookingProvenancePrefix(_row: PatientBookingRecord): string {
  return '';
}

/** Subtitle under datetime for native booking cards (active + history). */
export function nativeBookingSubtitle(row: PatientBookingRecord): string {
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
    return `Очный приём — ${place}${canonical.serviceTitle}`;
  }
  return 'Очный приём';
}
