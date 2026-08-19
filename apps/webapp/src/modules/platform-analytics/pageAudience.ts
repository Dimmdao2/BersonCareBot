export type PageAudience = 'doctor' | 'patient' | 'other';

/** Разрез заходов по кабинету: врач `/app/doctor|/app/admin|/app/settings`, пациент `/app/patient`. */
export function pageAudienceFromPageKey(pageKey: string): PageAudience {
  const key = pageKey.trim();
  if (key.startsWith('/app/patient')) return 'patient';
  if (
    key.startsWith('/app/doctor') ||
    key.startsWith('/app/admin') ||
    key.startsWith('/app/settings') ||
    key.startsWith('/app/account')
  ) {
    return 'doctor';
  }
  return 'other';
}

export function isPatientCabinetPageKey(pageKey: string): boolean {
  const key = pageKey.trim();
  return key === '/app/patient/cabinet' || key.startsWith('/app/patient/cabinet/');
}

/**
 * Кабинет врача — префикс `/app/doctor`, настоящее подмножество врачебной аудитории: в неё
 * входят ещё `/app/admin`, `/app/settings` и `/app/account`, которые кабинетом не являются.
 * Прежнее определение повторяло предикат аудитории, из-за чего «страницы врачей» и «кабинет
 * врачей» были одним и тем же числом.
 */
export function isDoctorCabinetPageKey(pageKey: string): boolean {
  const key = pageKey.trim();
  return key === '/app/doctor' || key.startsWith('/app/doctor/');
}

/**
 * Продуктовая аналитика собирается ТОЛЬКО у пациента: единственный маршрут приёма событий —
 * `POST /api/patient/analytics/events`, и он закрыт `requirePatientApiBusinessAccess`, а
 * единственный монтаж репортёра — `PatientClientLayout`. Врачебной сессии физически некуда
 * отправить `page_view`, поэтому врачебных строк в `product_analytics_hourly` нет ни на DEV, ни
 * на TEST. Показывать под врачебными карточками «0» — утверждать «врачи не заходили», хотя
 * верное утверждение «не измеряется»: аудитория без приёма событий отдаётся как заглушка.
 */
export function pageAudienceHasIngest(audience: PageAudience): boolean {
  return audience === 'patient';
}

export function isTreatmentProgramPageKey(pageKey: string): boolean {
  const key = pageKey.trim();
  return (
    key.startsWith('/app/patient/treatment') || key.startsWith('/app/patient/exercises')
  );
}
