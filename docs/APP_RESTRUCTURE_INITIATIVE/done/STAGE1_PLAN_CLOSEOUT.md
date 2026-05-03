# Закрытие этапа 1 APP_RESTRUCTURE (новости + каналы рассылок)

**Дата закрытия в репозитории:** 2026-05-01.  
**Исходный Cursor-план (machine-local):** при наличии — `~/.cursor/plans/этап_1_news_и_каналы_24d25507.plan.md` (копия статусов ниже для репо).

## Статусы задач плана

| ID | Содержание | Статус |
|----|------------|--------|
| `archive-news-db` | Экспорт `news_items`, запись пути к артефакту, pre-migration count | **cancelled в репо** — не автоматизировано; требование и риск зафиксированы в [LOG.md](../LOG.md) §«Этап 1»; исполнение только ops перед prod, см. [`BACKLOG_TAILS.md`](../../BACKLOG_TAILS.md) |
| `migration-db` | `0016_*`, Drizzle schema + relations | **completed** |
| `merge-purge-scripts` | platform-merge, purge, scripts, audit SQL | **completed** |
| `remove-news-ui` | CMS: редирект `/content/news`, мотивация, сайдбар, e2e | **completed** |
| `legacy-port-cleanup` | `PatientHomeLegacyContentPort` без новостей | **completed** |
| `broadcast-channels` | типы, сервис, PG audit, UI, тесты | **completed** |
| `verify-ci` | `pnpm run ci`, DoD | **completed** (2026-05-01) |

## Остатки (не блокируют merge)

Перенесены в [`BACKLOG_TAILS.md`](../../BACKLOG_TAILS.md) §«APP_RESTRUCTURE — хвосты этапа 1».
