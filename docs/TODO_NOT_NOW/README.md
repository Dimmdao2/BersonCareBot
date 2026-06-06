# Отложенные работы (не сейчас)

Короткий реестр задач, которые **осознанно не берём в текущий спринт**, но хотим сохранить: суть, ссылка на черновик плана, статус в коде.

## Когда класть сюда

- Есть **черновик** Cursor-плана (`.cursor/plans/*.plan.md`) или понятное ТЗ, но **нет активного исполнения**.
- Работа **не срочная** и **не блокирует** текущий трек (в отличие от пунктов в [`../TODO.md`](../TODO.md) — security, ops, post-prod риски).

## Когда не класть сюда

- Задача **в работе** — план в корне `.cursor/plans/` с `status: pending` / `in_progress`, журнал в профильной папке `docs/*`.
- Задача **закрыта** — план в [`.cursor/plans/archive/`](../../.cursor/plans/archive/) с `status: completed`, запись в [`../archive/TODO_BACKLOG_CLOSED_HISTORY.md`](../archive/TODO_BACKLOG_CLOSED_HISTORY.md) при необходимости.

## Формат карточки

Один файл на тему: `kebab-case.md` в этом каталоге.

- **Заголовок** — человекочитаемое имя.
- **Статус** — `черновик` | `ожидает решения` | `заблокировано` (кратко чем).
- **Суть** — 2–4 предложения простым языком.
- **План** — ссылка на `.cursor/plans/...plan.md` (если есть).
- **Код** — что уже есть / чего нет (одним абзацем).
- **Когда брать** — опционально, триггер или зависимость.

## Содержимое

| Карточка | Тема |
|----------|------|
| [`public_landing_metadata.md`](public_landing_metadata.md) | Title и meta description лендинга `/` из `system_settings` |
| [`login-register-backfill-appointments.md`](login-register-backfill-appointments.md) | Login/Register волна 2+: backfill `appointment_records` без `platform_user_id` (PHASE_07) |
| [`login-register-mass-setup-email.md`](login-register-mass-setup-email.md) | Login/Register волна 2+: массовая рассылка setup-code старой базе (PHASE_08) |
| [`product-platform-mass-patient.md`](product-platform-mass-patient.md) | Product Platform: mass/patient/guest split — **deferred** 2026-06-06; этап 0 docs сохранён |

При добавлении новой карточки — одна строка в таблице выше и ссылка из [`../README.md`](../README.md) (блок «Отложенные работы»).
