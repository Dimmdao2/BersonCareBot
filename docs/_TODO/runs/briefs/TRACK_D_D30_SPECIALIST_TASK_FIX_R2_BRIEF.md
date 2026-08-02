# Track D D30-P1 — saved-oracle fixer R2: полная revision готового intent

Роль: worker/fixer. Канон и authority те же, что в
`TRACK_D_D30_SPECIALIST_TASK_FIX_BRIEF.md`; продуктовый oracle — пункт «update/cancel/delete cannot deliver stale
intent» и исходный audit `D30_SPECIALIST_TASK_INDEPENDENT_AUDIT_2026-08-03.md`. Предыдущий fix `6f9d09f39` не
принят root.

Источник оракула: `TRACK_D_D30_SPECIALIST_TASK_SCHEDULING_BRIEF.md` — «Изменение `remind_at`/текста заменяет ещё
не отправленный intent» и «update/cancel/delete cannot deliver stale intent».

Остался один достижимый вариант той же поломки: `reminderText()` включает `task.dueAt`, update по `dueAt` запускает
re-enqueue, но content revision в `eventId()` хеширует только title/description. При уже `processing` строке и
неизменном `remind_at` новый intent получает тот же event id, исключается из terminalize и старый срок может уйти.

Исправить revision так, чтобы любое изменение материализованного ready intent, которое реально меняет получателя,
канал, текст/subject/url либо другой provider payload, давало новый deterministic event id; неизменный intent и
producer+tick replay сохраняют тот же id. Не хешировать `occurredAt` и иные случайные/текущие значения. Не создавать
новую очередь/репозиторий и не менять scheduler business ownership.

Добавить red-first проверки минимум для `dueAt` и recipient binding/email change при том же task/remind_at, плюс
неизменный replay. Повторить сохранённый processing-race на disposable PostgreSQL: старая строка dead, новая pending,
старый payload не может отправиться. Повторить targeted D30 tests, оба typecheck, scoped lint, queue/raw-SQL/journal
gates и `git diff --check`. Обновить существующий fix report честно. Временная `9999` остаётся вне journal;
DEV/TEST/PROD не трогать. Закоммитить в ту же ветку, push не делать.
