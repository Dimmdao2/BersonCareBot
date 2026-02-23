# Проверка на пустые директории и устаревший код

## Пустые директории

**Результат:** пустых директорий в `src/` нет. Все каталоги (app, channels, config, content, db, domain, integrations, observability, worker) содержат файлы.

---

## Устаревшая структура и ссылки

### Исправлено

1. **README.md** — в описании деплоя указан старый путь к миграции: `src/persistence/migrate.ts` → заменён на `src/db/migrate.ts`.
2. **src/domain/ports/messaging.ts** — в комментарии упоминался `adapters/telegram/client` → заменён на `channels/telegram/client`.
3. **dist/** — в каталоге после старых сборок оставались артефакты: `adapters/`, `core/`, `persistence/`, `services/`, `logger.js`, `dto/`, `routes/`, `telegram/`, `types/`. В `package.json` добавлен скрипт `clean` и сборка переведена на `pnpm run clean && tsc -p tsconfig.build.json`, чтобы перед каждой сборкой `dist/` очищался и не накапливал устаревшие папки/файлы.

### Только в документации (без изменений кода)

- **REFACTOR_PLAN.md** — упоминания `core`, `persistence`, `adapters` относятся к плану рефакторинга и оставлены как есть.

---

## Неиспользуемый код (задел)

| Файл | Статус | Комментарий |
|------|--------|-------------|
| **db/repos/topics.ts** | Не импортируется | `listActiveTopics`, `getTopicByKey`. Раньше использовались удалённым subscriptionService. Задел под Admin API (список тем рассылок). |
| **db/repos/subscriptions.ts** | Не импортируется | `getUserSubscriptions`, `toggleUserSubscription`, `upsertUserSubscription`. Аналогично — задел под подписки пользователей в Admin или будущие воркеры. |

Воркер рассылок (`worker/mailingWorker.ts`) работает с БД напрямую через `db.query()` (например, JOIN по `user_subscriptions`), репозитории topics/subscriptions не использует. Удалять их не обязательно: они соответствуют схеме БД (mailing_topics, user_subscriptions) и пригодятся для Admin API или других сценариев.

---

## Итог

- Пустых директорий нет.
- Устаревшие пути и комментарии в README и domain/ports/messaging исправлены.
- Сборка очищает `dist/` перед компиляцией — устаревшие артефакты в `dist/` больше не накапливаются.
- Код в `db/repos/topics.ts` и `db/repos/subscriptions.ts` не используется, но оставлен как задел под будущий функционал.
