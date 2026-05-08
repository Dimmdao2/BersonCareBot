import { DateTime } from "luxon";
import { parseBusinessInstant } from "@/shared/lib/formatBusinessDateTime";
import type {
  TreatmentProgramInstanceDetail,
  TreatmentProgramInstanceStageGroup,
  TreatmentProgramInstanceStageItemRow,
  TreatmentProgramInstanceStageRow,
  TreatmentProgramItemType,
  TreatmentProgramTemplateStageGroup,
} from "./types";

/** Системная группа шаблона этапа («Рекомендации» / «Тестирование»). */
export function isTreatmentProgramTemplateSystemStageGroup(
  g: Pick<TreatmentProgramTemplateStageGroup, "systemKind">,
): boolean {
  return g.systemKind === "recommendations" || g.systemKind === "tests";
}

/**
 * Тип элемента должен соответствовать системной группе (шаблон и экземпляр).
 * Для пользовательских групп (`systemKind == null`) проверка не применяется.
 */
export function assertTreatmentProgramStageItemFitsSystemGroup(
  group: Pick<TreatmentProgramTemplateStageGroup, "systemKind"> | undefined,
  itemType: TreatmentProgramItemType,
): void {
  if (!group?.systemKind) return;
  if (group.systemKind === "recommendations" && itemType !== "recommendation") {
    throw new Error("В группу «Рекомендации» можно помещать только рекомендации");
  }
  if (group.systemKind === "tests" && itemType !== "clinical_test") {
    throw new Error("В группу «Тестирование» можно помещать только клинические тесты");
  }
}

/**
 * Порядок групп шаблона на экране врача: рекомендации → пользовательские → тестирование.
 */
export function sortDoctorTemplateStageGroupsForDisplay<
  T extends Pick<TreatmentProgramTemplateStageGroup, "id" | "sortOrder" | "systemKind">,
>(groups: readonly T[]): T[] {
  return sortDoctorInstanceStageGroupsForDisplay(groups);
}

/**
 * Пациентский UI: есть ли в системной группе хотя бы один элемент, показываемый на поверхностях программы.
 */
export function patientInstanceSystemGroupHasVisibleItems(params: {
  group: Pick<TreatmentProgramInstanceStageGroup, "id" | "systemKind">;
  items: ReadonlyArray<
    Pick<TreatmentProgramInstanceStageItemRow, "groupId" | "itemType" | "status" | "isActionable">
  >;
}): boolean {
  const { group, items } = params;
  if (!isTreatmentProgramInstanceSystemStageGroup(group)) return true;
  return items.some(
    (it) => it.groupId === group.id && isInstanceStageItemShownOnPatientProgramSurfaces(it),
  );
}
export type TreatmentProgramInstanceDetailStageRow = TreatmentProgramInstanceDetail["stages"][number];

/** Системная группа экземпляра («Рекомендации» / «Тестирование»). */
export function isTreatmentProgramInstanceSystemStageGroup(
  g: Pick<TreatmentProgramInstanceStageGroup, "systemKind">,
): boolean {
  return g.systemKind === "recommendations" || g.systemKind === "tests";
}

/**
 * Порядок групп на экране врача: рекомендации → пользовательские → тестирование.
 */
export function sortDoctorInstanceStageGroupsForDisplay<
  T extends Pick<TreatmentProgramInstanceStageGroup, "id" | "sortOrder" | "systemKind">,
>(groups: readonly T[]): T[] {
  const rec = groups.filter((g) => g.systemKind === "recommendations");
  const tests = groups.filter((g) => g.systemKind === "tests");
  const user = groups.filter((g) => !g.systemKind);
  const userSorted = [...user].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  return [...rec, ...userSorted, ...tests];
}

/** Этап 0 «Общие рекомендации»: `sort_order = 0` на этапе экземпляра, вне FSM автозавершения. */
export function isStageZero(stage: Pick<TreatmentProgramInstanceStageRow, "sortOrder">): boolean {
  return stage.sortOrder === 0;
}

type ItemSemanticsFields = Pick<
  TreatmentProgramInstanceStageItemRow,
  "itemType" | "isActionable" | "status"
>;

/** Постоянная рекомендация: только instance-level `is_actionable === false` (O4). */
export function isPersistentRecommendation(item: ItemSemanticsFields): boolean {
  return item.itemType === "recommendation" && item.isActionable === false;
}

/** Учитывается ли элемент в автозавершении этапа (исключая disabled и persistent). */
export function isCompletableForStageProgress(item: ItemSemanticsFields): boolean {
  if (item.status === "disabled") return false;
  if (isPersistentRecommendation(item)) return false;
  return true;
}

export function isInstanceStageItemActiveForPatient(item: ItemSemanticsFields): boolean {
  return item.status !== "disabled";
}

/** Видимые элементы этапа на экранах программы пациента (detail, страница этапа). Скрыты только `disabled`. */
export function isInstanceStageItemShownOnPatientProgramSurfaces(
  item: Pick<TreatmentProgramInstanceStageItemRow, "itemType" | "status" | "isActionable">,
): boolean {
  return isInstanceStageItemActiveForPatient(item);
}

/**
 * Модалка «Состав этапа» (timeline): активные элементы, **без** `clinical_test`.
 * Клинические тесты при этом видны на экранах программы (список этапа, карточка элемента, модалка пункта), см. `isInstanceStageItemShownOnPatientProgramSurfaces`.
 * Элементы в системных группах «Рекомендации» / «Тестирование» не входят в компактный состав «упражнений» — у них отдельные блоки UI.
 */
export function isInstanceStageItemShownInPatientCompositionModal(
  item: Pick<TreatmentProgramInstanceStageItemRow, "itemType" | "status" | "isActionable"> &
    Partial<Pick<TreatmentProgramInstanceStageItemRow, "groupId">>,
  groups?: ReadonlyArray<Pick<TreatmentProgramInstanceStageGroup, "id" | "systemKind">>,
): boolean {
  if (!isInstanceStageItemActiveForPatient(item)) return false;
  if (item.itemType === "clinical_test") return false;
  if (groups && item.groupId) {
    const g = groups.find((x) => x.id === item.groupId);
    if (g && isTreatmentProgramInstanceSystemStageGroup(g)) return false;
  }
  return true;
}

/**
 * Пациентский экран плана: не рендерить секцию этапа целиком, если нет видимых пунктов и нет
 * сообщения о недоступности этапа (locked/skipped для не–этапа-0), и нет блока A1 (цель/задачи/срок).
 */
export function patientStageSectionShouldRender(
  stage: Pick<
    TreatmentProgramInstanceStageRow,
    | "status"
    | "goals"
    | "objectives"
    | "expectedDurationDays"
    | "expectedDurationText"
  > & {
    items: Array<ItemSemanticsFields>;
  },
  ignoreStageLockForContent: boolean,
): boolean {
  const contentBlocked =
    !ignoreStageLockForContent && (stage.status === "locked" || stage.status === "skipped");
  if (contentBlocked) return true;
  if (
    Boolean(stage.goals?.trim()) ||
    Boolean(stage.objectives?.trim()) ||
    stage.expectedDurationDays != null ||
    Boolean(stage.expectedDurationText?.trim())
  ) {
    return true;
  }
  return stage.items.some((it) => isInstanceStageItemShownOnPatientProgramSurfaces(it));
}

/** A5: бейдж «Новое» — только активный элемент, `last_viewed_at` ещё null, этап не заблокирован для контента. */
export function patientStageItemShowsNewBadge(
  item: Pick<TreatmentProgramInstanceStageItemRow, "itemType" | "isActionable" | "status" | "lastViewedAt">,
  contentBlockedForStage: boolean,
): boolean {
  if (contentBlockedForStage) return false;
  if (!isInstanceStageItemActiveForPatient(item)) return false;
  return item.lastViewedAt == null;
}

/**
 * Разбиение этапов для patient detail (1.1a): этап 0, «живой» pipeline и архив завершённых/пропущенных.
 */
export function splitPatientProgramStagesForDetailUi(stages: TreatmentProgramInstanceDetailStageRow[]): {
  stageZero: TreatmentProgramInstanceDetailStageRow[];
  archive: TreatmentProgramInstanceDetailStageRow[];
  pipeline: TreatmentProgramInstanceDetailStageRow[];
} {
  const ordered = [...stages].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const stageZero = ordered.filter(isStageZero);
  const nonZero = ordered.filter((s) => !isStageZero(s));
  const archive = nonZero.filter((s) => s.status === "completed" || s.status === "skipped");
  const pipeline = nonZero.filter((s) => s.status !== "completed" && s.status !== "skipped");
  return { stageZero, archive, pipeline };
}

/**
 * Открытый рабочий этап для пациента: `in_progress`, иначе первый `available`.
 * Этапы `locked` не считаются «текущими» — пациент их не открывает сам.
 */
export function selectCurrentWorkingStageForPatientDetail(
  pipeline: TreatmentProgramInstanceDetailStageRow[],
): TreatmentProgramInstanceDetailStageRow | null {
  const inProg = pipeline.find((s) => s.status === "in_progress");
  if (inProg) return inProg;
  const avail = pipeline.find((s) => s.status === "available");
  if (avail) return avail;
  return null;
}

/** Число завершённых этапов pipeline (`sort_order > 0`, статус `completed`). */
export function countPatientCompletedPipelineStages(
  stages: Pick<TreatmentProgramInstanceDetailStageRow, "sortOrder" | "status">[],
): number {
  return stages.reduce((n, s) => n + (s.sortOrder > 0 && s.status === "completed" ? 1 : 0), 0);
}

/**
 * Календарные дни от «сегодня» до даты контроля (начало суток в зоне пациента).
 * Если дата контроля в прошлом — `0`.
 */
export function calendarWholeDaysRemainingUntilUtcIso(
  now: DateTime,
  patientZone: string,
  controlUtcIso: string,
): number | null {
  const end = DateTime.fromISO(controlUtcIso, { zone: "utc" }).setZone(patientZone);
  if (!end.isValid) return null;
  const todayStart = now.setZone(patientZone).startOf("day");
  const endDayStart = end.startOf("day");
  const diff = endDayStart.diff(todayStart, "days").days;
  return Math.max(0, Math.floor(diff));
}

/**
 * Начало календарного дня дедлайна контроля: **дата** старта этапа в зоне пациента (без времени суток)
 * + `expected_duration_days` календарных дней.
 * Если `started_at` нет — якорь «сегодня» в зоне пациента (`available` / `in_progress` без старта).
 */
export function patientStageControlEndCalendarDayStart(
  stage: Pick<TreatmentProgramInstanceStageRow, "status" | "startedAt" | "expectedDurationDays">,
  now: DateTime,
  patientCalendarIana: string,
): DateTime | null {
  const days = stage.expectedDurationDays;
  if (days == null || !Number.isFinite(days) || days < 0) return null;

  const startedRaw = stage.startedAt;
  if (startedRaw != null && String(startedRaw).trim() !== "") {
    const dt = DateTime.fromISO(startedRaw, { zone: "utc" });
    if (dt.isValid) {
      const startDay = dt.setZone(patientCalendarIana).startOf("day");
      return startDay.plus({ days });
    }
  }

  if (stage.status === "available" || stage.status === "in_progress") {
    return now.setZone(patientCalendarIana).startOf("day").plus({ days });
  }
  return null;
}

/**
 * ISO-момент для отображения даты контроля пациенту (дедлайн = календарный день после «дата старта + N дней»).
 */
export function expectedStageControlDeadlineIsoForPatientUi(
  stage: Pick<TreatmentProgramInstanceStageRow, "status" | "startedAt" | "expectedDurationDays">,
  now: DateTime,
  patientCalendarIana: string,
): string | null {
  const endDay = patientStageControlEndCalendarDayStart(stage, now, patientCalendarIana);
  if (!endDay) return null;
  return endDay.toUTC().toISO();
}

/** Ожидаемая дата контроля для вызовов без зоны (тесты / совместимость): только при `started_at` и днях; календарный день UTC. */
export function expectedStageControlDateIso(
  stage: Pick<TreatmentProgramInstanceStageRow, "startedAt" | "expectedDurationDays">,
): string | null {
  if (stage.startedAt == null || stage.expectedDurationDays == null) return null;
  const days = stage.expectedDurationDays;
  if (!Number.isFinite(days) || days < 0) return null;
  return expectedStageControlDeadlineIsoForPatientUi(
    { ...stage, status: "in_progress" },
    DateTime.now(),
    "UTC",
  );
}

/**
 * Подпись вкладки «Прогресс»: сколько календарных дней осталось до ожидаемого контроля текущего открытого этапа.
 * Если pipeline-этапов нет, используем этап 0 (`in_progress`/`available`) как fallback.
 * `null` — нет открытого этапа для расчёта или не задан `expected_duration_days`.
 */
export function resolvePatientProgramControlRemainderDaysForPatientUi(
  detail: Pick<TreatmentProgramInstanceDetail, "stages" | "status">,
  now: DateTime,
  patientCalendarIana: string,
): number | null {
  if (detail.status !== "active") return null;
  const { stageZero, pipeline } = splitPatientProgramStagesForDetailUi(detail.stages);
  let stageForControl = selectCurrentWorkingStageForPatientDetail(pipeline);
  if (!stageForControl && pipeline.length === 0) {
    stageForControl = stageZero.find((s) => s.status === "in_progress") ?? stageZero.find((s) => s.status === "available") ?? null;
  }
  if (!stageForControl) return null;
  const endDayStart = patientStageControlEndCalendarDayStart(stageForControl, now, patientCalendarIana);
  if (!endDayStart) return null;
  const todayStart = now.setZone(patientCalendarIana).startOf("day");
  const diff = endDayStart.diff(todayStart, "days").days;
  return Math.max(0, Math.floor(diff));
}

/**
 * Patient HTTP/RSC read model (A2-READ-01): `disabled` rows stay in DB and doctor views;
 * пациентский API и RSC не отдают отключённые элементы в `stages[].items`.
 */
export function omitDisabledInstanceStageItemsForPatientApi(
  detail: TreatmentProgramInstanceDetail,
): TreatmentProgramInstanceDetail {
  return {
    ...detail,
    stages: detail.stages.map((stage) => {
      const items = stage.items.filter((it) => isInstanceStageItemActiveForPatient(it));
      const visibleGroupIds = new Set(
        items.map((it) => it.groupId).filter((gid): gid is string => gid !== null && gid !== ""),
      );
      const groups = stage.groups.filter((g) => visibleGroupIds.has(g.id));
      return { ...stage, items, groups };
    }),
  };
}

/**
 * Разметка тела этапа (интерактив / архив / запланированный) в `PatientTreatmentProgramStagePageClient`.
 * У пациента отдельного маршрута `/stages/[stageId]` нет — контент встроен во вкладку «Программа» на `/app/patient/treatment/[instanceId]`.
 */
export type PatientTreatmentProgramStageScreenVariant = "interactive" | "pastReadOnly" | "futureLocked";

/**
 * Этап 0 всегда интерактивный контент (общие рекомендации).
 * Архив: завершённые и пропущенные этапы pipeline (`sort_order > 0`).
 * Запланированный: `locked` в pipeline.
 */
export function patientTreatmentProgramStageScreenVariant(
  stage: Pick<TreatmentProgramInstanceStageRow, "sortOrder" | "status">,
): PatientTreatmentProgramStageScreenVariant {
  if (isStageZero(stage)) return "interactive";
  if (stage.status === "completed" || stage.status === "skipped") return "pastReadOnly";
  if (stage.status === "locked") return "futureLocked";
  return "interactive";
}

/**
 * Сколько этапов pipeline перед целевым ещё не в терминальном состоянии (`completed`/`skipped`).
 * Для подсказки «завершите активный этап / ещё N этапов» на заблокированном этапе.
 */
export function countBlockingStagesBeforePatientStage(
  stages: TreatmentProgramInstanceDetailStageRow[],
  target: Pick<TreatmentProgramInstanceDetailStageRow, "id" | "sortOrder">,
): number {
  if (target.sortOrder <= 0) return 0;
  const nonZero = stages
    .filter((s) => s.sortOrder > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const idx = nonZero.findIndex((s) => s.id === target.id);
  if (idx <= 0) return 0;
  let n = 0;
  for (let i = 0; i < idx; i++) {
    const s = nonZero[i];
    if (s.status !== "completed" && s.status !== "skipped") n += 1;
  }
  return n;
}

/** Последняя по времени отметка `completed_at` среди элементов этапа (для бейджа «завершён N дней назад»). */
export function latestCompletedAtIsoAmongStageItems(
  stage: Pick<TreatmentProgramInstanceDetailStageRow, "items">,
): string | null {
  let best: string | null = null;
  for (const it of stage.items) {
    const c = it.completedAt;
    if (c == null || String(c).trim() === "") continue;
    const cs = String(c);
    if (!best || cs > best) best = cs;
  }
  return best;
}

/** Календарные сутки от UTC-moment до «сегодня» в зоне отображения (минимум 0). */
export function calendarDaysFromUtcIsoToNowInZone(
  iso: string,
  zone: string,
  now: DateTime = DateTime.now(),
): number {
  const start = DateTime.fromISO(iso, { zone: "utc" }).setZone(zone).startOf("day");
  const end = now.setZone(zone).startOf("day");
  if (!start.isValid) return 0;
  return Math.max(0, Math.floor(end.diff(start, "days").days));
}

function ruDayWordNazad(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  const mod10 = n % 10;
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}

/** Относительный календарный день в зоне пациента без времени: «Сегодня», «Вчера», «N дней назад». */
export function formatRelativePatientCalendarDayRu(
  iso: string,
  zone: string,
  now: DateTime = DateTime.now(),
): string {
  const d = calendarDaysFromUtcIsoToNowInZone(iso, zone, now);
  if (d === 0) return "Сегодня";
  if (d === 1) return "Вчера";
  return `${d} ${ruDayWordNazad(d)} назад`;
}

/**
 * Момент начала отсчёта «дней в программе»: **самый ранний** непустой `started_at`
 * среди этапов pipeline (`sort_order > 0`). Если pipeline ещё ни разу не стартовал — берём ранний
 * старт этапа 0 (программа только из «нулевого» этапа). Иначе `created_at` экземпляра.
 */
export function patientProgramElapsedDaysAnchorIso(
  detail: Pick<TreatmentProgramInstanceDetail, "createdAt" | "stages">,
): string {
  const pipelineStarts: string[] = [];
  const zeroStarts: string[] = [];
  for (const s of detail.stages) {
    const st = s.startedAt;
    if (st == null || String(st).trim() === "") continue;
    if (s.sortOrder > 0) pipelineStarts.push(String(st));
    else if (s.sortOrder === 0) zeroStarts.push(String(st));
  }
  if (pipelineStarts.length > 0) {
    return pipelineStarts.reduce((a, b) => (a < b ? a : b));
  }
  if (zeroStarts.length > 0) {
    return zeroStarts.reduce((a, b) => (a < b ? a : b));
  }
  return detail.createdAt;
}

/**
 * Сколько полных «дней программы» прошло на текущий момент.
 * Граница суток — **03:00** локального времени пациента (`patientCalendarIana`):
 * до 03:00 относится к предыдущему логическому дню, после — к следующему.
 * Отсчёт от {@link patientProgramElapsedDaysAnchorIso} (старт первого этапа или назначение).
 */
export function computePatientProgramElapsedDayCount(
  detail: Pick<TreatmentProgramInstanceDetail, "createdAt" | "stages">,
  now: DateTime,
  patientCalendarIana: string,
  /** Как в шапке программы / `formatBookingDateLongRu` — для строк без `Z` и оффсета. */
  appDisplayTimeZoneForAnchorIso: string,
): number {
  const startIso = patientProgramElapsedDaysAnchorIso(detail);
  return computeProgressDaysAt0300(startIso, now, patientCalendarIana, appDisplayTimeZoneForAnchorIso);
}

/**
 * Число «День N» для пациентского UI: только при активной программе и после того,
 * как текущий рабочий этап вышел из состояния «только доступен» (ожидание первого входа).
 * Иначе `null` (как hero до старта на экране программы).
 */
export function resolvePatientProgramProgressDaysForPatientUi(
  detail: Pick<TreatmentProgramInstanceDetail, "createdAt" | "stages" | "status">,
  now: DateTime,
  patientCalendarIana: string,
  appDisplayTimeZoneForAnchorIso: string,
): number | null {
  if (detail.status !== "active") return null;
  const { stageZero, pipeline } = splitPatientProgramStagesForDetailUi(detail.stages);
  let currentWorkingStage = selectCurrentWorkingStageForPatientDetail(pipeline);
  if (!currentWorkingStage && pipeline.length === 0) {
    currentWorkingStage =
      stageZero.find((s) => s.status === "in_progress") ?? stageZero.find((s) => s.status === "available") ?? null;
  }
  if (!currentWorkingStage) return null;
  const awaitsStart = currentWorkingStage.status === "available";
  if (awaitsStart) return null;
  return computePatientProgramElapsedDayCount(detail, now, patientCalendarIana, appDisplayTimeZoneForAnchorIso);
}

/**
 * Число дней программы: каждый переход локальной границы 03:00 увеличивает счётчик.
 * «День» = `dt.setZone(iana).minus({ hours: 3 }).startOf('day')` (включительно от старта, минимум 1).
 *
 * Разбор `startIso`: как у экранов с датами записей — {@link parseBusinessInstant} в `isoParsingTimeZone`
 * (обычно таймзона приложения из настроек), чтобы наивные ISO без `Z` совпадали с текстом в шапке программы.
 * Граница 03:00 считается в `patientCalendarIana` (локальные сутки пациента).
 */
export function computeProgressDaysAt0300(
  startIso: string,
  now: DateTime,
  patientCalendarIana: string,
  isoParsingTimeZone: string = patientCalendarIana,
): number {
  const trimmed = startIso.trim();
  const parsedJs = parseBusinessInstant(trimmed, isoParsingTimeZone);
  const startInstant =
    Number.isNaN(parsedJs.getTime()) ? DateTime.fromISO(trimmed, { zone: "utc" }) : DateTime.fromMillis(parsedJs.getTime());

  const shift = (dt: DateTime) => {
    const z = dt.setZone(patientCalendarIana);
    if (!z.isValid) return dt.toUTC().minus({ hours: 3 }).startOf("day");
    return z.minus({ hours: 3 }).startOf("day");
  };
  const start = shift(startInstant);
  const today = shift(now);
  if (!start.isValid || !today.isValid) return 1;
  const raw = Math.floor(today.diff(start, "days").days);
  return Math.max(1, raw + 1);
}
