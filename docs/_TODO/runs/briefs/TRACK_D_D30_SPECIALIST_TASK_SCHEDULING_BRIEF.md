# Track D D30-P1 — specialist task reminder через единый resident scheduler/delivery queue

Роль: worker. Канон — `AGENTS.md` §5, §7, §10a/§10b, §24. Authority —
`docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` Р-D30/D30 и
`docs/_TODO/runs/integrator-cleanup/D30_SCHEDULER_REVERSAL_PLAN.md` Ш0–Ш1/B2.

## Источник оракула: решение владельца — «всё, что может переехать из крона в планировщик — переезжает туда»

Webapp владеет решением: получатели, выбранные каналы, текст и абсолютное `remind_at`. Resident scheduler/worker
только исполняет готовый intent и retry; cron и worker не вычисляют продуктовую политику.

## Один продуктовый пакет

1. Добавить обязательный `schedulerDecisionGuard` по D30 Ш0.1: resident runtime принимает только готовые intents,
   абсолютное время и tenant scope; четыре self-test класса из плана должны падать на обходе.
2. Добавить nullable `organization_id` в существующую `public.outgoing_delivery_queue` и индекс
   `(organization_id,status,next_retry_at)`. Все новые tenant rows обязаны иметь org; старые строки читаются
   fail-closed через существующую совместимость до дренажа. Новую очередь не создавать.
3. Расширить единый webapp queue-write port: готовый `OutgoingIntent`, абсолютный `nextRetryAt`, deterministic
   `event_id`, вставка через переданный Drizzle transaction client.
4. Create/update specialist task атомарно пишет task + одну ready queue row на каждый выбранный доступный канал.
   Изменение `remind_at`/текста заменяет ещё не отправленный intent; completion/delete терминализируют stale rows
   в той же транзакции.
5. Legacy internal tick временно только enqueue-backfill с тем же event id, без direct send. Если write-time producer
   и tick пересеклись, на канал остаётся одна row. Cron/script удаляется только после отдельного observation этапа.
6. Worker исполняет общий transport intent, не ветвится по причине `specialist_task_reminder`; retryable failure
   остаётся durable, permanent уходит в dead. `reminder_sent_at` не становится новым вторым каноном.

## Миграция и scope

Использовать временный высокий local filename без правки `meta/_journal.json`; финальный номер/idx/when назначает
лид при сведении с актуальным feat. Разрешены specialist-tasks create/update/delete/tick, единый queue port/schema/
worker, scheduler guard и точечные docs/tests. Не трогать D18 projection-health/raw-SQL gate, identity D25–D29,
CMS/tariffs/billing, DEV/TEST/PROD. Не создавать вторую queue/repository/cron.

## Red-first и готовность

- task + N channel rows commit together; queue insert failure rolls back task;
- update/cancel/delete cannot deliver stale intent;
- write producer + concurrent backfill tick = exactly one row/channel;
- worker does not read business settings/rules and preserves retry/dead semantics;
- existing D30 concurrency gates green;
- webapp/integrator targeted tests, both typecheck, scoped lint, raw-SQL and diff-check green;
- explicit staging, commit(s), no push, clean tree, report exact commands.
