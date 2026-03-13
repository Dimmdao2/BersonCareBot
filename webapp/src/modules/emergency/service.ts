export type EmergencyTopic = {
  id: string;
  title: string;
  summary: string;
};

const topics: EmergencyTopic[] = [
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

export function listEmergencyTopics(): EmergencyTopic[] {
  return topics;
}
