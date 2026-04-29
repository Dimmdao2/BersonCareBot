/**
 * Диагностика неразрешённых / скрытых целей блоков главной (админ-превью).
 * Только строки и типы — без обращений к БД.
 */

export type PatientHomeUnresolvedKind =
  | "missing_target"
  | "hidden_item"
  | "block_hidden"
  | "course_unpublished"
  | "section_requires_auth"
  | "section_not_visible";

export type PatientHomeUnresolvedRef = {
  kind: PatientHomeUnresolvedKind;
  /** slug, id или короткая подпись для сообщения */
  targetKey?: string;
};

export function describePatientHomeUnresolvedRef(ref: PatientHomeUnresolvedRef): string {
  const tail = ref.targetKey ? ` (${ref.targetKey})` : "";
  switch (ref.kind) {
    case "missing_target":
      return `Цель не найдена в CMS${tail}.`;
    case "hidden_item":
      return `Элемент скрыт и не показывается пациенту${tail}.`;
    case "block_hidden":
      return "Блок скрыт: пациенты его не видят.";
    case "course_unpublished":
      return `Курс не опубликован${tail}.`;
    case "section_requires_auth":
      return `Раздел только для авторизованных: гость его не увидит${tail}.`;
    case "section_not_visible":
      return `Раздел скрыт в CMS (is_visible=false)${tail}.`;
  }
}
