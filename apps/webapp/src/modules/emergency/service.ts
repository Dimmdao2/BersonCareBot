import type { ContentPagesPort } from "@/infra/repos/pgContentPages";

export type EmergencyTopic = {
  id: string;
  title: string;
  summary: string;
};

const hardcodedTopics: EmergencyTopic[] = [
  {
    id: "back-pain",
    title: "Острая боль в спине",
    summary: "Быстрые рекомендации и безопасные первые шаги перед обращением к специалисту.",
  },
  {
    id: "neck-pain",
    title: "Острая боль в шее",
    summary: "Короткие рекомендации для снижения нагрузки и наблюдения за симптомами.",
  },
  {
    id: "panic-attack",
    title: "Паническая атака",
    summary: "Поддерживающий сценарий с базовым дыханием и переходом к записи на прием.",
  },
];

export async function listEmergencyTopics(contentPages?: ContentPagesPort): Promise<EmergencyTopic[]> {
  if (contentPages) {
    try {
      const rows = await contentPages.listBySection("emergency");
      if (rows.length > 0) {
        return rows.map((r) => ({
          id: r.slug,
          title: r.title,
          summary: r.summary,
        }));
      }
    } catch (err) {
      console.error("content DB fallback:", err);
      // fallback to hardcoded data
    }
  }
  return hardcodedTopics;
}
