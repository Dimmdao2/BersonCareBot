import type { ContentPageRow } from "@/infra/repos/pgContentPages";
import type { Exercise, ExerciseMedia } from "@/modules/lfk-exercises/types";
import type { Template } from "@/modules/lfk-templates/types";
import { recommendationDomainTitle } from "@/modules/recommendations/recommendationDomain";
import type { Recommendation } from "@/modules/recommendations/types";
import type { TestSet } from "@/modules/tests/types";
import {
  LESSON_CONTENT_SECTION,
  LESSON_CONTENT_SECTION_LEGACY,
} from "@/modules/treatment-program/types";
import type { TreatmentProgramLibraryPickers } from "./[id]/TreatmentProgramConstructorClient";

function exerciseThumbUrl(m: ExerciseMedia | undefined): string | null {
  if (!m) return null;
  return m.previewSmUrl ?? m.previewMdUrl ?? m.mediaUrl ?? null;
}

const LOAD_SUBTITLE: Record<NonNullable<Exercise["loadType"]>, string> = {
  strength: "Сила / укрепление",
  stretch: "Растяжка",
  balance: "Равновесие",
  cardio: "Кардио",
  other: "Другое",
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

export function buildTreatmentProgramLibraryPickers(params: {
  exercises: Exercise[];
  lfkTemplates: Template[];
  testSets: TestSet[];
  recommendations: Recommendation[];
  contentPagesAll: ContentPageRow[];
}): TreatmentProgramLibraryPickers {
  const { exercises, lfkTemplates, testSets, recommendations, contentPagesAll } = params;
  return {
    exercises: exercises.map((e) => ({
      id: e.id,
      title: e.title,
      subtitle: e.loadType ? LOAD_SUBTITLE[e.loadType] : null,
      thumbUrl: exerciseThumbUrl(e.media[0]),
    })),
    lfkComplexes: lfkTemplates.map((t) => {
      const desc = t.description?.trim();
      return {
        id: t.id,
        title: t.title,
        subtitle:
          typeof t.exerciseCount === "number" ? `${t.exerciseCount} упражнений в комплексе` : null,
        thumbUrl: lfkTemplateThumb(t),
        description: desc ? desc : null,
      };
    }),
    testSets: testSets.map((ts) => {
      const firstPreview = ts.items[0]?.test.previewMedia;
      const thumb =
        firstPreview?.mediaUrl && firstPreview.mediaUrl.trim() !== ""
          ? firstPreview.mediaUrl.trim()
          : null;
      const n = ts.items.length;
      return {
        id: ts.id,
        title: ts.title,
        subtitle: n > 0 ? `${n} тестов в наборе` : "Пустой набор",
        thumbUrl: thumb,
      };
    }),
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
