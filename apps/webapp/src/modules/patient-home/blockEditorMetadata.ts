import type { PatientHomeBlockCode, PatientHomeBlockItemTargetType } from "./ports";
import { allowedTargetTypesForBlock, canManageItemsForBlock } from "./blocks";

/**
 * Централизованный admin-copy и правила редактора блоков главной пациента.
 * Согласовано с `docs/archive/2026-05-initiatives/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/BLOCK_EDITOR_CONTRACT.md`.
 */
export type PatientHomeBlockEditorMetadata = {
  code: PatientHomeBlockCode;
  displayTitle: string;
  itemNoun: string | null;
  /** Пункт меню: подключить уже существующий объект из CMS к блоку. */
  pickExistingLabel: string | null;
  /** Подзаголовок диалога выбора из списка (когда `pickExistingLabel` задан). */
  pickExistingDialogDescription: string | null;
  canManageItems: boolean;
  allowedTargetTypes: readonly PatientHomeBlockItemTargetType[];
  allowedTargetTypeLabels: Record<PatientHomeBlockItemTargetType, string>;
  emptyPreviewText: string;
  emptyRuntimeText: string;
  inlineCreate: {
    contentSection: boolean;
    /** Пункт меню: мастер нового раздела на этом экране; только если `contentSection`. */
    sectionMenuLabel: string | null;
  };
};

const TARGET_LABELS_RU: Record<PatientHomeBlockItemTargetType, string> = {
  content_section: "Раздел",
  content_page: "Материал",
  course: "Курс",
  static_action: "Действие",
};

/** Текст в превью, когда в CMS-блоке нет видимых карточек (без жаргона «элементы»). */
const CMS_EMPTY_PREVIEW =
  "После выбора материалов и разделов ниже блок появится на главной. Если блок выключен — пациенты его не видят.";

function cloneTargetLabels(): Record<PatientHomeBlockItemTargetType, string> {
  return { ...TARGET_LABELS_RU };
}

const DEFAULT_INLINE_SECTION_MENU = "Новый раздел (создать здесь)";

function cmsBlockBase(
  code: PatientHomeBlockCode,
  displayTitle: string,
  itemNoun: string,
  pickExistingLabel: string,
  pickExistingDialogDescription: string,
  emptyRuntimeText: string,
  opts?: { inlineSectionMenuLabel?: string },
): PatientHomeBlockEditorMetadata {
  const allowedTargetTypes = allowedTargetTypesForBlock(code);
  const contentSection = allowedTargetTypes.includes("content_section");
  return {
    code,
    displayTitle,
    itemNoun,
    pickExistingLabel,
    pickExistingDialogDescription,
    canManageItems: canManageItemsForBlock(code),
    allowedTargetTypes,
    allowedTargetTypeLabels: cloneTargetLabels(),
    emptyPreviewText: CMS_EMPTY_PREVIEW,
    emptyRuntimeText,
    inlineCreate: {
      contentSection,
      sectionMenuLabel: contentSection ? (opts?.inlineSectionMenuLabel ?? DEFAULT_INLINE_SECTION_MENU) : null,
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
    pickExistingLabel: null,
    pickExistingDialogDescription: null,
    canManageItems: canManageItemsForBlock(code),
    allowedTargetTypes,
    allowedTargetTypeLabels: cloneTargetLabels(),
    emptyPreviewText,
    emptyRuntimeText,
    inlineCreate: { contentSection: false, sectionMenuLabel: null },
  };
}

const METADATA_BY_CODE: Record<PatientHomeBlockCode, PatientHomeBlockEditorMetadata> = {
  situations: cmsBlockBase(
    "situations",
    "Быстрые ситуации (разделы)",
    "раздел",
    "Выбрать существующий раздел",
    "В списке только разделы из системной папки «Ситуации» в CMS. Так вы подключаете к блоку уже созданный раздел.",
    "При нуле резолвящихся элементов блок на главной пациента обычно не показывается.",
    { inlineSectionMenuLabel: "Создать новый раздел здесь" },
  ),
  daily_warmup: cmsBlockBase(
    "daily_warmup",
    "Разминка дня (hero)",
    "материал",
    "Выбрать страницу разминки",
    "В списке только опубликованные страницы из системной папки «Разминки». Одна подключённая страница — одна карточка в ротации блока.",
    "Исключение: на главной пациента сохраняется пустое состояние hero-разминки, даже если материал не выбран (блок не скрывается полностью).",
  ),
  useful_post: cmsBlockBase(
    "useful_post",
    "Полезный пост",
    "материал",
    "Выбрать страницу для блока",
    "В списке материалы из каталога статей и из системных папок CMS, кроме зон «Разминки» и SOS.",
    "Без валидной CMS-страницы блок на главной пациента не отображается.",
  ),
  subscription_carousel: cmsBlockBase(
    "subscription_carousel",
    "Подписки и уведомления",
    "раздел / материал / курс",
    "Выбрать из CMS: раздел, страницу или курс",
    "Подключение не создаёт контент — только добавляет ссылку на уже существующий раздел, страницу или курс в карусель.",
    "Без резолвящихся элементов карусель на главной пациента может не отображаться.",
    { inlineSectionMenuLabel: "Новый раздел каталога (создать здесь)" },
  ),
  sos: cmsBlockBase(
    "sos",
    "Если болит сейчас",
    "раздел или материал",
    "Выбрать раздел или страницу SOS",
    "В списке только контент из системной папки SOS в CMS.",
    "Без валидных целей блок на главной пациента может не показываться.",
    { inlineSectionMenuLabel: "Новый раздел SOS (создать здесь)" },
  ),
  courses: cmsBlockBase(
    "courses",
    "Курсы",
    "курс",
    "Выбрать курс из каталога",
    "Подключается уже созданный курс; порядок и видимость настраиваются отдельно.",
    "Если в блоке нет опубликованных и видимых курсов, ряд курсов на главной пациента не показывается.",
  ),
  booking: nonCmsBlock(
    "booking",
    "Запись на приём",
    "Запись к специалисту по правилам приложения и интеграции записи.",
    "Пациент видит блок записи по правилам приложения и интеграции записи.",
  ),
  progress: nonCmsBlock(
    "progress",
    "Прогресс",
    "Сводка прогресса пациента по данным приложения.",
    "Пациент видит прогресс по данным приложения.",
  ),
  next_reminder: nonCmsBlock(
    "next_reminder",
    "Ближайшее напоминание",
    "Карточка ближайшего активного напоминания пациента.",
    "Пациент видит ближайшее активное напоминание.",
  ),
  mood_checkin: nonCmsBlock(
    "mood_checkin",
    "Настроение",
    "Краткий чекин настроения на главной.",
    "Пациент видит форму чекина настроения.",
  ),
  plan: nonCmsBlock(
    "plan",
    "План",
    "План дня или лечения по данным продукта.",
    "Пациент видит блок плана по правилам продукта.",
  ),
};

export function getPatientHomeBlockEditorMetadata(code: PatientHomeBlockCode): PatientHomeBlockEditorMetadata {
  return METADATA_BY_CODE[code];
}
