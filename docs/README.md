# Документация BersonCareBot

## Порты и инфраструктура (источник истины)

**Порты BersonCareBot:** см. **SERVER CONVENTIONS.md** в корне репозитория.

| Служба   | Dev  | Prod |
|----------|------|------|
| API      | 4200 | 3200 |
| Webapp   | 5200 | 6200 |

Деплой, nginx, БД, systemd: **deploy/HOST_DEPLOY_README.md**.

---

## Документы в корне

| Файл | Назначение |
|------|------------|
| **README.md** | Запуск, конфиг, команды, endpoints. |
| **ARCHITECTURE.md** | Контракт: слои, запреты, pipeline, изоляция. |
| **SERVER CONVENTIONS.md** | Порты, БД, пользователи PostgreSQL, nginx, systemd (все проекты хоста). |
| **SCENARIO_LOGIC_SUMMARY.md** | Описание логики сценариев (Telegram, Rubitime). |

---

## docs/

| Файл | Назначение |
|------|------------|
| **FULL PLATFORM MODEL.md** | Концепция платформы: мессенджеры, Web-App, backend. |
| **DB_STRUCTURE_AND_RECOMMENDATIONS.md** | Модель БД (users, identities, contacts), правила интеграций. |
| **CONTENT_AND_SCRIPTS_FLOW.md** | Откуда скрипты/шаблоны/меню, матчинг сценариев по событию. |
| **MESSAGING_CONTRACT.md** | Контракт message.send / message.edit: payload, parse_mode (HTML), ссылки в тексте. |
| **REMINDERS_ROADMAP.md** | План по напоминаниям. |
| **plan-channel-from-context.md** | План: канал из контекста. |
| **MAX_SETUP.md** | Подключение MAX бота к интегратору и вебапп (env, webhook, проверка). |
| **archive/** | Исторические отчёты, аудиты, выполненный рефакторинг (см. `archive/README.md`). |

---

## Спеки слоёв (src/)

Описание ответственности слоёв — в `*.md` рядом с кодом:

- `src/app/app.md`
- `src/content/content.md`
- `src/kernel/domain/domain.md`
- `src/kernel/eventGateway/eventGateway.md`
- `src/kernel/orchestrator/orchestrstor.md`
- `src/integrations/integrations.md`
- `src/infra/db/db.md`, `src/infra/db/schema.md`
- `src/infra/dispatcher/dispatcher.md`
- `src/infra/queue/queue.md`
- `src/infra/runtime/*.md`, `src/infra/observability/observability.md`

---

## Webapp

- **webapp/README.md** — запуск, роуты, контракт с интегратором.
- **webapp/INTEGRATOR_CONTRACT.md** — подписанные ссылки, auth exchange, webhooks.
- **webapp/ARCHITECTURE.md** — структура Next.js, роли, доступ.
