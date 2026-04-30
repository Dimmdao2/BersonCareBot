import type { PatientHomeBlockItem, PatientHomeBlockItemTargetType } from "./ports";

/** Slug/id → человекочитаемое имя из CMS (страница, раздел, курс). */
export type PatientHomeRefDisplayTitles = {
  contentPages: Readonly<Record<string, string>>;
  contentSections: Readonly<Record<string, string>>;
  courses: Readonly<Record<string, string>>;
};

export const emptyPatientHomeRefDisplayTitles: PatientHomeRefDisplayTitles = {
  contentPages: {},
  contentSections: {},
  courses: {},
};

export function buildPatientHomeRefDisplayTitles(input: {
  pages: ReadonlyArray<{ slug: string; title: string }>;
  sections: ReadonlyArray<{ slug: string; title: string }>;
  courses: ReadonlyArray<{ id: string; title: string }>;
}): PatientHomeRefDisplayTitles {
  const contentPages: Record<string, string> = {};
  for (const p of input.pages) {
    contentPages[p.slug] = p.title;
  }
  const contentSections: Record<string, string> = {};
  for (const s of input.sections) {
    contentSections[s.slug] = s.title;
  }
  const courses: Record<string, string> = {};
  for (const c of input.courses) {
    courses[c.id] = c.title;
  }
  return { contentPages, contentSections, courses };
}

const TARGET_TYPE_LABELS_RU: Record<PatientHomeBlockItemTargetType, string> = {
  content_section: "Раздел",
  content_page: "Материал",
  course: "Курс",
  static_action: "Действие",
};

/** Подпись типа цели для подстрочника в админке (строка из API / БД). */
export function patientHomeBlockItemTargetTypeLabelRu(targetType: string): string {
  if (targetType in TARGET_TYPE_LABELS_RU) {
    return TARGET_TYPE_LABELS_RU[targetType as PatientHomeBlockItemTargetType];
  }
  return targetType;
}

/**
 * Заголовок строки в настройках главной: кастомный override или название из CMS, иначе ref.
 */
export function patientHomeBlockItemDisplayTitle(
  item: PatientHomeBlockItem,
  titles: PatientHomeRefDisplayTitles,
): string {
  const override = item.titleOverride?.trim();
  if (override) return override;
  const ref = item.targetRef.trim();
  if (!ref) return item.targetRef;
  if (item.targetType === "content_page") return titles.contentPages[ref] ?? ref;
  if (item.targetType === "content_section") return titles.contentSections[ref] ?? ref;
  if (item.targetType === "course") return titles.courses[ref] ?? ref;
  return ref;
}
