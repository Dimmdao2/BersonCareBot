export const routePaths = {
  root: "/app",
  patient: "/app/patient",
  doctor: "/app/doctor",
  settings: "/app/settings",
  lessons: "/app/patient/lessons",
  emergency: "/app/patient/emergency",
  cabinet: "/app/patient/cabinet",
  purchases: "/app/patient/purchases",
  symptoms: "/app/patient/diary/symptoms",
  lfk: "/app/patient/diary/lfk",
  bindPhone: "/app/patient/bind-phone",
} as const;

/** Маршруты пациента, для которых нужна привязка номера телефона (личные данные, записи, дневники, покупки). Остальное (меню, уроки, скорая, контент) — без обязательного телефона. */
export const patientPathsRequiringPhone: readonly string[] = [
  routePaths.cabinet,
  routePaths.purchases,
  routePaths.symptoms,
  routePaths.lfk,
];
