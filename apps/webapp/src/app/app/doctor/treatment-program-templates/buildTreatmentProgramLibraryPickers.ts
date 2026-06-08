import type { ContentPageRow } from "@/infra/repos/pgContentPages";
import type { Exercise, ExerciseMedia } from "@/modules/lfk-exercises/types";
import type { Template } from "@/modules/lfk-templates/types";
import { recommendationDomainTitle } from "@/modules/recommendations/recommendationDomain";
import type { Recommendation } from "@/modules/recommendations/types";
import type { ClinicalTest, TestSet } from "@/modules/tests/types";
import {
  LESSON_CONTENT_SECTION,
  LESSON_CONTENT_SECTION_LEGACY,
} from "@/modules/treatment-program/types";
import type { TreatmentProgramLibraryPickers } from "@/app/app/doctor/treatment-program-shared/treatmentProgramLibraryTypes";
import {
  buildExerciseMetaById,
  buildLfkComplexLibraryFilterMeta,
  mapExerciseRegionCodes,
} from "@/app/app/doctor/treatment-program-shared/treatmentProgramLibraryPickerFilters";

function exerciseThumbUrl(m: ExerciseMedia | undefined): string | null {
  if (!m) return null;
  return m.previewSmUrl ?? m.previewMdUrl ?? m.mediaUrl ?? null;
}

const LOAD_SUBTITLE: Record<string, string> = {
  strength: "Сила / укрепление",
  stretch: "Растяжка",
  balance: "Равновесие",
  cardio: "Кардио",
  other: "Другое",
  static_hold: "Статическое укрепление / удержание",
};

function lfkTemplateThumb(t: Template): string | null {
  const m = t.exerciseThumbnails?.[0];
  return exerciseThumbUrl(m ?? undefined);
}

function lessonMeta(p: ContentPageRow): { subtitle: string; thumbUrl: string | null } {
  const sec =
    p.section === LESSON_CONTENT_SECTION
      ? "Раздел: уроки"
      : p.section === LESSON_CONTENT_SECTION_LEGACY
        ? "Раздел: уроки (legacy)"
        : `Раздел: ${p.section}`;
  return { subtitle: sec, thumbUrl: p.imageUrl?.trim() || null };
}

function clinicalTestThumbUrl(t: ClinicalTest): string | null {
  const m = t.media[0];
  if (!m?.mediaUrl?.trim()) return null;
  return m.mediaUrl.trim();
}

export function buildTreatmentProgramLibraryPickers(params: {
  exercises: Exercise[];
  lfkTemplates: Template[];
  testSets: TestSet[];
  clinicalTests: ClinicalTest[];
  recommendations: Recommendation[];
  contentPagesAll: ContentPageRow[];
  /** UUID региона → `reference_items.code`; для фильтров модалки / конструктора. */
  bodyRegionIdToCode?: Record<string, string>;
}): TreatmentProgramLibraryPickers {
  const { exercises, lfkTemplates, testSets, clinicalTests, recommendations, contentPagesAll, bodyRegionIdToCode } =
    params;
  const exerciseMetaById = buildExerciseMetaById(exercises);

  return {
    exercises: exercises.map((e) => ({
      id: e.id,
      title: e.title,
      subtitle: e.loadType ? (LOAD_SUBTITLE[e.loadType] ?? null) : null,
      thumbUrl: exerciseThumbUrl(e.media[0]),
      regionCodes: mapExerciseRegionCodes(e.regionRefIds, bodyRegionIdToCode),
      loadType: e.loadType,
    })),
    lfkComplexes: lfkTemplates.map((t) => {
      const desc = t.description?.trim();
      const filterMeta = buildLfkComplexLibraryFilterMeta(t, exerciseMetaById, bodyRegionIdToCode);
      const sortedExercises = [...t.exercises].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
      );
      return {
        id: t.id,
        title: t.title,
        subtitle:
          typeof t.exerciseCount === "number" ? `${t.exerciseCount} упражнений в комплексе` : null,
        thumbUrl: lfkTemplateThumb(t),
        description: desc ? desc : null,
        ...filterMeta,
        expandLines: sortedExercises.map((line) => {
          const title = line.exerciseTitle?.trim() || "Упражнение";
          const m = line.firstMedia;
          const snapshot: Record<string, unknown> = {
            itemType: "exercise",
            id: line.exerciseId,
            title,
            ...(m?.mediaUrl?.trim()
              ? {
                  media: [
                    {
                      mediaUrl: m.mediaUrl.trim(),
                      mediaType: m.mediaType ?? "image",
                      sortOrder: 0,
                    },
                  ],
                }
              : {}),
          };
          const hasLoad =
            line.reps != null || line.sets != null || line.maxPain0_10 != null;
          return {
            itemRefId: line.exerciseId,
            snapshot,
            ...(hasLoad
              ? {
                  loadSettings: {
                    reps: line.reps,
                    sets: line.sets,
                    maxPain: line.maxPain0_10,
                  },
                }
              : {}),
          };
        }),
      };
    }),
    testSets: testSets.map((ts) => {
      const firstPreview = ts.items[0]?.test.previewMedia;
      const thumb =
        firstPreview?.mediaUrl && firstPreview.mediaUrl.trim() !== ""
          ? firstPreview.mediaUrl.trim()
          : null;
      const n = ts.items.length;
      const sortedItems = [...ts.items].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
      return {
        id: ts.id,
        title: ts.title,
        subtitle: n > 0 ? `${n} тестов в наборе` : "Пустой набор",
        thumbUrl: thumb,
        expandLines: sortedItems.map((line) => {
          const test = line.test;
          const previewUrl = test.previewMedia?.mediaUrl?.trim();
          const snapshot: Record<string, unknown> = {
            itemType: "clinical_test",
            id: test.id,
            title: test.title,
            tests: [
              {
                testId: test.id,
                title: test.title,
                sortOrder: line.sortOrder,
                comment: line.comment,
                ...(previewUrl
                  ? { media: [{ mediaUrl: previewUrl, mediaType: "image", sortOrder: 0 }] }
                  : {}),
              },
            ],
          };
          return { itemRefId: test.id, snapshot };
        }),
      };
    }),
    clinicalTests: clinicalTests
      .filter((ct) => !ct.isArchived)
      .map((ct) => ({
        id: ct.id,
        title: ct.title,
        subtitle: ct.testType?.trim() || null,
        thumbUrl: clinicalTestThumbUrl(ct),
      })),
    recommendations: recommendations.map((r) => ({
      id: r.id,
      title: r.title,
      subtitle: recommendationDomainTitle(r.domain ?? null) || null,
      thumbUrl: r.media[0]?.mediaUrl?.trim() || null,
    })),
    lessons: contentPagesAll
      .filter(
        (p) =>
          (p.section === LESSON_CONTENT_SECTION || p.section === LESSON_CONTENT_SECTION_LEGACY) &&
          !p.deletedAt,
      )
      .map((p) => {
        const meta = lessonMeta(p);
        return {
          id: p.id,
          title: p.title,
          subtitle: meta.subtitle,
          thumbUrl: meta.thumbUrl,
        };
      }),
  };
}
