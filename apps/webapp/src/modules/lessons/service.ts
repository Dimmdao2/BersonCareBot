/**
 * @deprecated Для списков на пациентских страницах используйте `/app/patient/sections/[slug]` и `content_pages`.
 * Оставлено для обратной совместимости и тестов.
 */
import type { ContentPagesPort } from "@/infra/repos/pgContentPages";

export type LessonCard = {
  id: string;
  title: string;
  type: "video" | "exercise" | "lesson";
  summary: string;
  status: "available" | "coming-soon";
};

const hardcodedLessons: LessonCard[] = [
  {
    id: "neck-warmup",
    title: "Разминка для шеи",
    type: "video",
    summary: "Короткая сессия для безопасного старта дня и снижения напряжения.",
    status: "available",
  },
  {
    id: "back-basics",
    title: "Базовые принципы разгрузки спины",
    type: "lesson",
    summary: "Объяснение базовых привычек, которые помогают уменьшить бытовую перегрузку.",
    status: "available",
  },
  {
    id: "breathing-reset",
    title: "Дыхательная пауза при стрессе",
    type: "exercise",
    summary: "Короткая практика для быстрого восстановления внимания и ритма дыхания.",
    status: "coming-soon",
  },
];

export async function listLessons(contentPages?: ContentPagesPort): Promise<LessonCard[]> {
  if (contentPages) {
    try {
      const rows = await contentPages.listBySection("lessons");
      if (rows.length > 0) {
        return rows.map((r) => ({
          id: r.slug,
          title: r.title,
          type: "lesson" as const,
          summary: r.summary,
          status: "available" as const,
        }));
      }
    } catch (err) {
      console.error("content DB fallback:", err);
      // fallback to hardcoded data
    }
  }
  return hardcodedLessons;
}
