import type { PatientHomeBlockItemTargetType, PatientHomeCmsBlockCode } from "@/modules/patient-home/blocks";

/** Строка элемента блока в редакторе (Phase 2; позже — из БД). */
export type PatientHomeEditorItemRow = {
  id: string;
  targetType: PatientHomeBlockItemTargetType;
  targetRef: string;
  title: string;
  isVisible: boolean;
  resolved: boolean;
};

export type PatientHomeEditorCandidateRow = {
  id: string;
  targetType: PatientHomeBlockItemTargetType;
  targetRef: string;
  title: string;
  /** Статус сущности для doctor picker (Phase 5), напр. draft / published. */
  statusLabel?: string;
};

/** Демо-данные для экрана до подключения `patient_home_*`. */
export function getDemoPatientHomeEditorPayload(code: PatientHomeCmsBlockCode): {
  items: PatientHomeEditorItemRow[];
  candidates: PatientHomeEditorCandidateRow[];
} {
  switch (code) {
    case "situations":
      return {
        items: [
          {
            id: "demo-s1",
            targetType: "content_section",
            targetRef: "office",
            title: "Офис",
            isVisible: true,
            resolved: true,
          },
          {
            id: "demo-s2",
            targetType: "content_section",
            targetRef: "missing-slug",
            title: "Неразрешённый раздел",
            isVisible: true,
            resolved: false,
          },
        ],
        /** Пустой список кандидатов — сценарий inline-create (Phase 3); реальные разделы подставляет страница врача из БД. */
        candidates: [],
      };
    case "daily_warmup":
      return {
        items: [
          {
            id: "demo-w1",
            targetType: "content_page",
            targetRef: "warmup-intro",
            title: "Вводная разминка",
            isVisible: true,
            resolved: true,
          },
        ],
        candidates: [
          { id: "demo-c-w1", targetType: "content_page", targetRef: "page-a", title: "Материал A" },
        ],
      };
    case "subscription_carousel":
      return {
        items: [
          {
            id: "demo-m1",
            targetType: "content_section",
            targetRef: "news",
            title: "Новости",
            isVisible: true,
            resolved: true,
          },
        ],
        candidates: [
          { id: "demo-mc1", targetType: "content_section", targetRef: "sec-x", title: "Раздел X" },
          { id: "demo-mc2", targetType: "content_page", targetRef: "page-x", title: "Материал X" },
          { id: "demo-mc3", targetType: "course", targetRef: "course-1", title: "Курс «Старт»", statusLabel: "published" },
        ],
      };
    case "sos":
      return {
        items: [
          {
            id: "demo-sos1",
            targetType: "content_page",
            targetRef: "emergency-intro",
            title: "Скорая памятка",
            isVisible: false,
            resolved: true,
          },
        ],
        candidates: [
          { id: "demo-sos-c1", targetType: "content_section", targetRef: "emergency", title: "Раздел SOS" },
          { id: "demo-sos-c2", targetType: "content_page", targetRef: "sos-page", title: "Страница SOS" },
        ],
      };
    case "courses":
      return {
        items: [
          {
            id: "demo-cr1",
            targetType: "course",
            targetRef: "course-draft",
            title: "Черновик курса",
            isVisible: true,
            resolved: false,
          },
        ],
        candidates: [
          {
            id: "demo-cr-c1",
            targetType: "course",
            targetRef: "course-live",
            title: "Опубликованный курс",
            statusLabel: "published",
          },
        ],
      };
    default: {
      const _e: never = code;
      return _e;
    }
  }
}
