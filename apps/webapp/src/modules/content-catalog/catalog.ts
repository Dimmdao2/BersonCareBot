import type { ContentStubItem } from "./types";

/**
 * Base catalog entries for stub pages. Slug must be unique.
 * Video and image can be added per entry; test video URL comes from env in service.
 */
const STUB_ENTRIES: Omit<ContentStubItem, "videoSource">[] = [
  { slug: "back-pain", title: "Острая боль в спине", summary: "Быстрые рекомендации и безопасные первые шаги.", bodyText: "Здесь будет раздел с рекомендациями при острой боли в спине." },
  { slug: "neck-pain", title: "Острая боль в шее", summary: "Короткие рекомендации для снижения нагрузки.", bodyText: "Здесь будет раздел с рекомендациями при острой боли в шее." },
  { slug: "panic-attack", title: "Паническая атака", summary: "Поддерживающий сценарий с базовым дыханием.", bodyText: "Здесь будет раздел с рекомендациями при панической атаке." },
  { slug: "neck-warmup", title: "Разминка для шеи", summary: "Короткая сессия для безопасного старта дня.", bodyText: "Здесь будет видео и описание разминки для шеи." },
  { slug: "back-basics", title: "Базовые принципы разгрузки спины", summary: "Объяснение базовых привычек.", bodyText: "Здесь будет урок о базовых принципах разгрузки спины." },
  { slug: "breathing-reset", title: "Дыхательная пауза при стрессе", summary: "Короткая практика для быстрого восстановления.", bodyText: "Скоро здесь появится практика дыхательной паузы." },
  { slug: "test-video", title: "Тестовое видео", summary: "Проверка воспроизведения видео.", bodyText: "Ниже — тестовый видеоролик для проверки плеера." },
];

export function getBaseCatalog(): Omit<ContentStubItem, "videoSource">[] {
  return [...STUB_ENTRIES];
}
