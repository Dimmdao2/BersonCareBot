export const routePaths = {
  root: "/app",
  patient: "/app/patient",
  doctor: "/app/doctor",
  settings: "/app/settings",
  lessons: "/app/patient/lessons",
  emergency: "/app/patient/emergency",
  cabinet: "/app/patient/cabinet",
  profile: "/app/patient/profile",
  notifications: "/app/patient/notifications",
  purchases: "/app/patient/purchases",
  symptoms: "/app/patient/diary/symptoms",
  lfk: "/app/patient/diary/lfk",
  bindPhone: "/app/patient/bind-phone",
  /** Сообщения пациента (заглушка до модуля). */
  patientMessages: "/app/patient/messages",
  /** Справка (заглушка). */
  patientHelp: "/app/patient/help",
  /** Установка PWA / приложения (заглушка). */
  patientInstall: "/app/patient/install",
} as const;

/** Маршруты пациента, для которых нужна привязка номера телефона (личные данные, записи, дневники, покупки). Остальное (меню, уроки, скорая, контент) — без обязательного телефона. */
export const patientPathsRequiringPhone: readonly string[] = [
  routePaths.cabinet,
  routePaths.purchases,
  routePaths.symptoms,
  routePaths.lfk,
];
