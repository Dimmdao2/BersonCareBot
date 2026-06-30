import {
  DEFAULT_PATIENT_SUPPORT_PATH,
  LOGIN_CONTACT_SUPPORT_PATH,
} from "@/modules/system-settings/supportContactConstants";
import { patientWarmupsSectionHref } from "@/modules/patient-home/warmupsSection";
import type { PatientPlanTab } from "@/app/app/patient/treatment/patientPlanTab";

export const routePaths = {
  root: "/app",
  /** Поддержка с экрана входа (гость, без сессии). */
  loginContactSupport: LOGIN_CONTACT_SUPPORT_PATH,
  patient: "/app/patient",
  /** Редирект из напоминаний бота: актуальная разминка дня (как «Начать разминку» на главной). */
  patientGoDailyWarmup: "/app/patient/go/daily-warmup",
  /** Редирект из напоминаний бота: «Начать занятие» по программе (как на карточке плана / в программе). */
  patientGoPlanStartLesson: "/app/patient/go/plan-start-lesson",
  doctor: "/app/doctor",
  /** Установка Staff PWA (волна 2 §B). */
  doctorInstall: "/app/doctor/install",
  /** Настройка блоков главной пациента (doctor/admin). */
  doctorPatientHome: "/app/doctor/patient-home",
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
  /** Экран «Запись подтверждена» — добавить в календарь / скачать ICS. */
  bookingNewDone: "/app/patient/booking/new/done",
  /** Адрес кабинета (iframe сайта специалиста). */
  patientAddress: "/app/patient/address",
  /** Кратко о специалисте + ссылка на полный сайт. */
  patientAbout: "/app/patient/about",
  profile: "/app/patient/profile",
  notifications: "/app/patient/notifications",
  notificationSettings: "/app/patient/notifications/settings",
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
  patientHelpArticle: (slug: string) => `/app/patient/help/${encodeURIComponent(slug)}`,
  /** Форма обращения в поддержку (Telegram админу). */
  patientSupport: DEFAULT_PATIENT_SUPPORT_PATH,
  /** Установка PWA / приложения (не в основном меню; прямой URL). */
  patientInstall: "/app/patient/install",
  /** Напоминания пациента. */
  patientReminders: "/app/patient/reminders",
  /** Полный текст рассылки врача (deep link из push). */
  patientBroadcast: (auditId: string) =>
    `/app/patient/broadcasts/${encodeURIComponent(auditId)}`,
  /** Журнал действий по одному правилу (`integrator_rule_id`). */
  patientReminderJournal: (ruleIntegratorId: string) =>
    `/app/patient/reminders/journal/${encodeURIComponent(ruleIntegratorId)}`,
  /** Online intake — LFK (online-only flow). */
  intakeLfk: "/app/patient/intake/lfk",
  /** Каталог курсов (продажа → тот же экземпляр программы, что и назначение врача). */
  patientCourses: "/app/patient/courses",
  /** Промо-программа по умолчанию (шаблон из admin settings, до материализации). */
  patientTreatmentPromoDefault: "/app/patient/treatment/promo",
  patientTreatmentPromoTemplateItem: (templateStageItemId: string) =>
    `/app/patient/treatment/promo/item/${encodeURIComponent(templateStageItemId)}`,
  /** Программы лечения (назначенные экземпляры). */
  patientTreatmentPrograms: "/app/patient/treatment",
  /** `planTab` — вкладка плана при возврате (`?tab=`). Для `program` query не добавляется. */
  patientTreatmentProgram: (instanceId: string, planTab?: PatientPlanTab | null) => {
    const base = `/app/patient/treatment/${encodeURIComponent(instanceId)}`;
    if (!planTab || planTab === "program") return base;
    return `${base}?tab=${encodeURIComponent(planTab)}`;
  },
  /**
   * Детальный просмотр пункта программы (не модалка).
   * `nav` — см. `parsePatientProgramItemNavMode`.
   * `planTab` — вкладка плана для ссылки «Назад» (`planTab` в query).
   * `testId` — для `nav=tests`: uuid теста в снимке пункта (`clinical_test`).
   */
  patientTreatmentProgramItem: (
    instanceId: string,
    itemId: string,
    nav?: string,
    planTab?: PatientPlanTab | null,
    testId?: string | null,
  ) => {
    const base = `/app/patient/treatment/${encodeURIComponent(instanceId)}/item/${encodeURIComponent(itemId)}`;
    const sp = new URLSearchParams();
    if (nav && nav !== "default") sp.set("nav", nav);
    if (planTab && planTab !== "program") sp.set("planTab", planTab);
    if (testId && testId.trim()) sp.set("testId", testId.trim());
    const q = sp.toString();
    return q ? `${base}?${q}` : base;
  },
  /** @internal Редирект со старых закладок; не использовать в новом UI. */
  patientTreatmentProgramStage: (instanceId: string, stageId: string) =>
    `/app/patient/treatment/${encodeURIComponent(instanceId)}`,
  /** Раздел CMS «Разминки» (канонический slug — см. `warmupsSection.ts`). */
  patientWarmups: patientWarmupsSectionHref(),
  /** Online intake — Nutrition questionnaire. */
  intakeNutrition: "/app/patient/intake/nutrition",
  /** Doctor online-intake inbox. */
  doctorOnlineIntake: "/app/doctor/online-intake",
  /** Расписание врача (новый URL, объединяет calendar + appointments + admin/booking). */
  doctorSchedule: "/app/doctor/schedule",
  /** Коммуникации врача (новый URL, объединяет messages + online-intake + broadcasts). */
  doctorCommunications: "/app/doctor/communications",
  /** Список пациентов врача (новый раздел «Пациенты», Patients list page). */
  doctorPatients: "/app/doctor/patients",
  /** Карточка пациента (Patients card page). */
  doctorPatientCard: (userId: string) => `/app/doctor/patients/${encodeURIComponent(userId)}`,
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
