import type { PatientHomeBlockCode, PatientHomeBlockItemTargetType } from "./ports";
import { allowedTargetTypesForBlock, canManageItemsForBlock } from "./blocks";

/**
 * Централизованный admin-copy и правила редактора блоков главной пациента.
 * Согласовано с `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/BLOCK_EDITOR_CONTRACT.md`.
 */
export type PatientHomeBlockEditorMetadata = {
  code: PatientHomeBlockCode;
  displayTitle: string;
  itemNoun: string | null;
  addLabel: string | null;
  canManageItems: boolean;
  allowedTargetTypes: readonly PatientHomeBlockItemTargetType[];
  allowedTargetTypeLabels: Record<PatientHomeBlockItemTargetType, string>;
  emptyPreviewText: string;
  emptyRuntimeText: string;
  inlineCreate: { contentSection: boolean };
};

const TARGET_LABELS_RU: Record<PatientHomeBlockItemTargetType, string> = {
  content_section: "Раздел",
  content_page: "Материал",
  course: "Курс",
  static_action: "Действие",
};

/** Включённый CMS-блок без видимых элементов + скрытый блок (BLOCK_EDITOR_CONTRACT, MASTER_PLAN §2.1). */
const CMS_EMPTY_PREVIEW =
  "Если блок включён и нет видимых элементов, на главной пациента блок не появится, пока не появятся видимые элементы. Если блок скрыт, пациенты его не увидят.";

function cloneTargetLabels(): Record<PatientHomeBlockItemTargetType, string> {
  return { ...TARGET_LABELS_RU };
}

function cmsBlockBase(
  code: PatientHomeBlockCode,
  displayTitle: string,
  itemNoun: string,
  addLabel: string,
  emptyRuntimeText: string,
): PatientHomeBlockEditorMetadata {
  const allowedTargetTypes = allowedTargetTypesForBlock(code);
  return {
    code,
    displayTitle,
    itemNoun,
    addLabel,
    canManageItems: canManageItemsForBlock(code),
    allowedTargetTypes,
    allowedTargetTypeLabels: cloneTargetLabels(),
    emptyPreviewText: CMS_EMPTY_PREVIEW,
    emptyRuntimeText,
    inlineCreate: {
      contentSection: allowedTargetTypes.includes("content_section"),
    },
  };
}

function nonCmsBlock(
  code: PatientHomeBlockCode,
  displayTitle: string,
  emptyPreviewText: string,
  emptyRuntimeText: string,
): PatientHomeBlockEditorMetadata {
  const allowedTargetTypes = allowedTargetTypesForBlock(code);
  return {
    code,
    displayTitle,
    itemNoun: null,
    addLabel: null,
    canManageItems: canManageItemsForBlock(code),
    allowedTargetTypes,
    allowedTargetTypeLabels: cloneTargetLabels(),
    emptyPreviewText,
    emptyRuntimeText,
    inlineCreate: { contentSection: false },
  };
}

const METADATA_BY_CODE: Record<PatientHomeBlockCode, PatientHomeBlockEditorMetadata> = {
  situations: cmsBlockBase(
    "situations",
    "Быстрые ситуации (разделы)",
    "раздел",
    "Добавить раздел",
    "При нуле резолвящихся элементов блок на главной пациента обычно не показывается.",
  ),
  daily_warmup: cmsBlockBase(
    "daily_warmup",
    "Разминка дня (hero)",
    "материал",
    "Добавить материал",
    "Исключение: на главной пациента сохраняется пустое состояние hero-разминки, даже если материал не выбран (блок не скрывается полностью).",
  ),
  useful_post: cmsBlockBase(
    "useful_post",
    "Полезный пост",
    "материал",
    "Выбрать материал",
    "Без валидной CMS-страницы блок на главной пациента не отображается.",
  ),
  subscription_carousel: cmsBlockBase(
    "subscription_carousel",
    "Подписки и уведомления",
    "раздел / материал / курс",
    "Добавить раздел / материал / курс",
    "Без резолвящихся элементов карусель на главной пациента может не отображаться.",
  ),
  sos: cmsBlockBase(
    "sos",
    "Если болит сейчас",
    "раздел или материал",
    "Добавить раздел или материал",
    "Без валидных целей блок на главной пациента может не показываться.",
  ),
  courses: cmsBlockBase(
    "courses",
    "Курсы",
    "курс",
    "Добавить курс",
    "Если в блоке нет опубликованных и видимых курсов, ряд курсов на главной пациента не показывается.",
  ),
  booking: nonCmsBlock(
    "booking",
    "Запись на приём",
    "Этот блок не настраивается списком элементов: сценарий записи задаётся вне списка материалов главной.",
    "Пациент видит блок записи по правилам приложения и интеграции записи.",
  ),
  progress: nonCmsBlock(
    "progress",
    "Прогресс",
    "Этот блок не настраивается списком элементов: показатели приходят из фактического прогресса пациента.",
    "Пациент видит прогресс по данным приложения.",
  ),
  next_reminder: nonCmsBlock(
    "next_reminder",
    "Ближайшее напоминание",
    "Этот блок не настраивается списком элементов: отображается ближайшее активное напоминание.",
    "Пациент видит ближайшее активное напоминание.",
  ),
  mood_checkin: nonCmsBlock(
    "mood_checkin",
    "Настроение",
    "Этот блок не настраивается списком элементов: это встроенный чекин настроения на главной.",
    "Пациент видит форму чекина настроения.",
  ),
  plan: nonCmsBlock(
    "plan",
    "План",
    "Этот блок не настраивается списком элементов главной.",
    "Пациент видит блок плана по правилам продукта.",
  ),
};

export function getPatientHomeBlockEditorMetadata(code: PatientHomeBlockCode): PatientHomeBlockEditorMetadata {
  return METADATA_BY_CODE[code];
}
