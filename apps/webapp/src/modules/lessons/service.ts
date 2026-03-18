export type LessonCard = {
  id: string;
  title: string;
  type: "video" | "exercise" | "lesson";
  summary: string;
  status: "available" | "coming-soon";
};

const lessons: LessonCard[] = [
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

export function listLessons(): LessonCard[] {
  return lessons;
}
