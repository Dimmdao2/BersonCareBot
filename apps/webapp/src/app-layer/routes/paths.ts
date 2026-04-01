export const routePaths = {
  root: "/app",
  patient: "/app/patient",
  doctor: "/app/doctor",
  settings: "/app/settings",
  lessons: "/app/patient/sections/lessons",
  emergency: "/app/patient/sections/emergency",
  cabinet: "/app/patient/cabinet",
  /** Запись на приём (Rubitime), без обязательного телефона. */
  patientBooking: "/app/patient/booking",
  /** Wizard: шаг 1 — формат. */
  bookingNew: "/app/patient/booking/new",
  bookingNewCity: "/app/patient/booking/new/city",
  bookingNewService: "/app/patient/booking/new/service",
  bookingNewSlot: "/app/patient/booking/new/slot",
  bookingNewConfirm: "/app/patient/booking/new/confirm",
  /** Адрес кабинета (iframe сайта клиники). */
  patientAddress: "/app/patient/address",
  profile: "/app/patient/profile",
  notifications: "/app/patient/notifications",
  purchases: "/app/patient/purchases",
  /** Единая страница дневника с вкладками «Симптомы» / «ЛФК». */
  diary: "/app/patient/diary",
  symptoms: "/app/patient/diary?tab=symptoms",
  lfk: "/app/patient/diary?tab=lfk",
  /** Журнал записей симптомов (I.8): фильтр по месяцу, редактирование записей. */
  diarySymptomsJournal: "/app/patient/diary/symptoms/journal",
  /** Журнал занятий ЛФК. */
  diaryLfkJournal: "/app/patient/diary/lfk/journal",
  bindPhone: "/app/patient/bind-phone",
  /** Сообщения пациента (поддержка, webapp-чат). */
  patientMessages: "/app/patient/messages",
  /** Справка (не в основном меню; прямой URL). */
  patientHelp: "/app/patient/help",
  /** Установка PWA / приложения (не в основном меню; прямой URL). */
  patientInstall: "/app/patient/install",
  /** Напоминания пациента. */
  patientReminders: "/app/patient/reminders",
  /** Online intake — LFK (online-only flow). */
  intakeLfk: "/app/patient/intake/lfk",
  /** Online intake — Nutrition questionnaire. */
  intakeNutrition: "/app/patient/intake/nutrition",
  /** Doctor online-intake inbox. */
  doctorOnlineIntake: "/app/doctor/online-intake",
} as const;

/** Маршруты пациента, для которых нужна привязка номера телефона (дневники, покупки и т.д.). «Мои записи» и запись Rubitime — без обязательного телефона (заглушка в UI). Остальное (меню, уроки, скорая, контент) — без телефона. */
export const patientPathsRequiringPhone: readonly string[] = [
  routePaths.purchases,
  routePaths.diary,
  routePaths.symptoms,
  routePaths.lfk,
  routePaths.diarySymptomsJournal,
  routePaths.diaryLfkJournal,
];
