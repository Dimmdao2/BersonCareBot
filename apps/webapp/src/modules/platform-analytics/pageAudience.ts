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

export function isDoctorCabinetPageKey(pageKey: string): boolean {
  return pageAudienceFromPageKey(pageKey) === 'doctor';
}

export function isTreatmentProgramPageKey(pageKey: string): boolean {
  const key = pageKey.trim();
  return (
    key.startsWith('/app/patient/treatment') || key.startsWith('/app/patient/exercises')
  );
}
