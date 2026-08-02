# Track D D21 — единое occurrence напоминаний

## Authority и результат для человека

Authority: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`, Р-D21 и D21.

Человек настраивает напоминание один раз и выбирает каналы. Независимо от bot identity напоминание планируется
одним scheduler, каждый выбранный канал получает одну доставку, а `done`, `skip`, `snooze`, mute и отключение
topic управляют той же исполняемой occurrence. Накопленные расписания и ещё актуальные pending occurrence не
теряются. Тихие часы и автоматический повтор из-за молчания не добавляются.

## Обязательный продуктовый пакет

1. `public.reminder_rules` остаётся единственным расписанием. `reminders.planDue` планирует правила по
   `platform_user_id`, в том числе без `integrator_user_id`.
2. Bot и Web Push используют одну `integrator.user_reminder_occurrences`; отдельный
   `webapp_reminder_occurrences` runtime-path удаляется после доказанного переноса актуального pending state.
3. Добавить stable delivery generation. Первый успешный snooze увеличивает generation атомарно; replay того же
   действия сохраняет прежние `snoozed_until` и generation. Queue/event/log id различают occurrence × generation ×
   channel; stale generation не отправляется.
4. Перед provider send один canonical gate проверяет актуальную generation, done/skip, global mute и
   topic/channel enablement. Done/skip/mute гасят все legs, topic-disable — только соответствующий канал.
5. Глобальный статус occurrence не должен гасить sibling channel той же generation: Telegram и MAX, когда выбраны
   оба, отправляются по одному разу; retry одного leg не повторяет уже успешный sibling.
6. Web Push action передаёт unified integrator occurrence id; skip сохраняет только факт (`reason = NULL`).
7. Из `handlers/reminders.ts` убрать локальные расчёты snooze/mute, taxonomy причин и русские fallback-решения.
   Handler только передаёт действие canonical capability и доставляет готовый channel response/copy.
8. Использовать существующие ports и copy/deeplink builders. Не строить второй scheduler/worker и не расширять
   полный D39 сверх generation/idempotency, без которых D21 не работает.

## Migration 0322

Forward-only migration может добавить `platform_user_id` и `delivery_generation` к operational occurrence,
backfill/constraints/indexes, обновить snooze capability и перенести только ещё актуальные pending legacy rows.
Applied 0312/0314/0321 не менять. Journal entry добавлять в конец фактического журнала после синхронизации с
текущим `feat`; номер файла не определяет journal idx. Runtime grants только минимальные, tenant/org fail-closed.
Legacy table удалять лишь после migration proof о сохранении schedules/pending и zero live consumers.

## Red-first acceptance и kill-set

- правило без bot identity планируется ровно один раз;
- Web Push action на unified occurrence больше не возвращает `not_found`, skip reason равен `NULL`;
- Telegram + MAX при выборе обоих дают две независимые доставки;
- done/skip до claim не вызывают ни одного provider;
- mute гасит все legs, topic-disable только соответствующий leg;
- snooze создаёт ровно одну новую generation; replay не создаёт следующую;
- retry старой generation не отправляется; новый generation отправляется один раз на канал;
- retry одного канала не повторяет успешный sibling;
- accumulated schedules и актуальный pending state сохраняются;
- foreign org/user не может читать или менять occurrence, injection/raw-SQL обхода нет.

Проверки: узкие behavioral tests integrator/webapp, PostgreSQL migration/capability integration proof, оба
typecheck, scoped lint, `node scripts/check-no-new-raw-sql.mjs`, `git diff --check`. Полный `pnpm run ci` не
запускать до сведения остальных продуктовых веток. DEV apply и live proof — только после независимого PASS и
координации единственного migration writer. TEST/PROD не трогать.

## Допустимый scope

Reminder scheduler/repos/contracts, outgoing delivery queue/worker, Web Push service worker/session actions,
0322 migration, удаляемый webpush-only scheduler/internal route/deploy reference, behavioral tests и D21 docs.
Не трогать CMS, tariffs, billing и соседние appointment reminder preset файлы; общие файлы менять минимально.
