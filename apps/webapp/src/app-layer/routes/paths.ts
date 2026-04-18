import {
  DEFAULT_PATIENT_SUPPORT_PATH,
  LOGIN_CONTACT_SUPPORT_PATH,
} from "@/modules/system-settings/supportContactConstants";

export const routePaths = {
  root: "/app",
  /** Поддержка с экрана входа (гость, без сессии). */
  loginContactSupport: LOGIN_CONTACT_SUPPORT_PATH,
  patient: "/app/patient",
  doctor: "/app/doctor",
  settings: "/app/settings",
  /** Каталог разделов CMS (публичные + при tier patient). */
  patientSectionsIndex: "/app/patient/sections",
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
  /** Форма обращения в поддержку (Telegram админу). */
  patientSupport: DEFAULT_PATIENT_SUPPORT_PATH,
  /** Установка PWA / приложения (не в основном меню; прямой URL). */
  patientInstall: "/app/patient/install",
  /** Напоминания пациента. */
  patientReminders: "/app/patient/reminders",
  /** Журнал действий по одному правилу (`integrator_rule_id`). */
  patientReminderJournal: (ruleIntegratorId: string) =>
    `/app/patient/reminders/journal/${encodeURIComponent(ruleIntegratorId)}`,
  /** Online intake — LFK (online-only flow). */
  intakeLfk: "/app/patient/intake/lfk",
  /** Каталог курсов (продажа → тот же экземпляр программы, что и назначение врача). */
  patientCourses: "/app/patient/courses",
  /** Программы лечения (назначенные экземпляры). */
  patientTreatmentPrograms: "/app/patient/treatment-programs",
  patientTreatmentProgram: (instanceId: string) =>
    `/app/patient/treatment-programs/${encodeURIComponent(instanceId)}`,
  /** Online intake — Nutrition questionnaire. */
  intakeNutrition: "/app/patient/intake/nutrition",
  /** Doctor online-intake inbox. */
  doctorOnlineIntake: "/app/doctor/online-intake",
} as const;

/**
 * Исторический список для документации. Фактическая политика: `patientPathRequiresBoundPhone`
 * (`modules/platform-access/patientRouteApiPolicy.ts`) и `app/app/patient/layout.tsx`.
 */
export const patientPathsRequiringPhone: readonly string[] = [
  routePaths.purchases,
  routePaths.diary,
  routePaths.symptoms,
  routePaths.lfk,
  routePaths.diarySymptomsJournal,
  routePaths.diaryLfkJournal,
];
