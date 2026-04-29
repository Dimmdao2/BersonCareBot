import type { PatientHomeBlockCode, PatientHomeBlockItemTargetType } from "@/modules/patient-home/blocks";
import { isPatientHomeCmsBlockCode } from "@/modules/patient-home/blocks";

/** Копирайт редактора блоков (MASTER_PLAN Phase 1). */
export type PatientHomeBlockEditorMetadata = {
  itemNoun: string;
  addLabel: string;
  emptyPreviewText: string;
  emptyRuntimeText: string;
  allowedTargetTypeLabels: Record<PatientHomeBlockItemTargetType, string>;
};

const TARGET_LABELS_RU: Record<PatientHomeBlockItemTargetType, string> = {
  content_section: "Раздел",
  content_page: "Материал",
  course: "Курс",
};

const VISIBLE_EMPTY_ADMIN =
  "Блок включен, но на главной пациента не появится, пока нет видимых элементов.";

function cmsMeta(
  itemNoun: string,
  addLabel: string,
  emptyRuntimeText: string,
): PatientHomeBlockEditorMetadata {
  return {
    itemNoun,
    addLabel,
    emptyPreviewText: VISIBLE_EMPTY_ADMIN,
    emptyRuntimeText,
    allowedTargetTypeLabels: { ...TARGET_LABELS_RU },
  };
}

export function getPatientHomeBlockEditorMetadata(code: PatientHomeBlockCode): PatientHomeBlockEditorMetadata {
  switch (code) {
    case "situations":
      return cmsMeta(
        "раздел",
        "Добавить раздел",
        "При отсутствии видимых разделов блок «Ситуации» не показывается на главной пациента.",
      );
    case "daily_warmup":
      return cmsMeta(
        "материал",
        "Добавить материал",
        "Если материал не выбран, на главной пациента остаётся карточка разминки с пустым состоянием (не скрывать блок полностью).",
      );
    case "subscription_carousel":
      return cmsMeta(
        "элемент",
        "Добавить раздел / материал / курс",
        "Карусель не отображается, пока нет ни одного резолвящегося элемента.",
      );
    case "sos":
      return cmsMeta(
        "элемент",
        "Добавить раздел или материал",
        "Блок SOS не показывается пациенту, если нет валидной цели.",
      );
    case "courses":
      return cmsMeta("курс", "Добавить курс", "Ряд курсов на главной скрыт, если нет опубликованных курсов в блоке.");
    case "lfk_progress":
      return {
        itemNoun: "—",
        addLabel: "",
        emptyPreviewText:
          "Этот блок не настраивается списком: данные приходят из дневника ЛФК и занятий за сегодня.",
        emptyRuntimeText: "Пациент видит прогресс по фактическим данным дневника.",
        allowedTargetTypeLabels: { ...TARGET_LABELS_RU },
      };
    case "next_reminder":
      return {
        itemNoun: "—",
        addLabel: "",
        emptyPreviewText:
          "Этот блок не настраивается списком: данные приходят из напоминаний пациента.",
        emptyRuntimeText: "Пациент видит ближайшее активное напоминание.",
        allowedTargetTypeLabels: { ...TARGET_LABELS_RU },
      };
    case "mood_checkin":
      return {
        itemNoun: "—",
        addLabel: "",
        emptyPreviewText: "Этот блок не настраивается списком: встроенный чекин настроения.",
        emptyRuntimeText: "Пациент видит форму чекина настроения.",
        allowedTargetTypeLabels: { ...TARGET_LABELS_RU },
      };
  }
}

export function getPatientHomeBlockDisplayTitle(code: PatientHomeBlockCode): string {
  switch (code) {
    case "situations":
      return "Быстрые ситуации (разделы)";
    case "daily_warmup":
      return "Разминка дня";
    case "subscription_carousel":
      return "Подписки и уведомления";
    case "sos":
      return "Если болит сейчас";
    case "courses":
      return "Курсы";
    case "lfk_progress":
      return "Прогресс за день";
    case "next_reminder":
      return "Ближайшее напоминание";
    case "mood_checkin":
      return "Настроение";
  }
}

/** Заголовок диалога выбора элемента (замена общего «Выберите элемент для блока»). */
export function getPatientHomeAddItemDialogTitle(code: PatientHomeBlockCode): string {
  if (!isPatientHomeCmsBlockCode(code)) {
    return "Элементы не настраиваются";
  }
  const { itemNoun } = getPatientHomeBlockEditorMetadata(code);
  return `Выберите ${itemNoun} для блока`;
}
