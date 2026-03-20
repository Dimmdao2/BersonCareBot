# Stage 4: Cutover rules and rollback boundaries

Документ фиксирует правила cutover и границы отката для этапа «Стабилизировать patient master после cutover» (DB_ZONES_RESTRUCTURE.md, Этап 4).

## Критерии go (разрешено считать cutover завершённым)

Выполнить по порядку:

1. **CI зелёный:** `pnpm run ci` завершается с кодом 0.
2. **Projection health:** `pnpm --dir apps/integrator run projection-health` — в выводе `deadCount === 0`, при необходимости проверить `pendingCount` и лаг по `oldestPendingAt`.
3. **Reconciliation в пороге:** `pnpm --dir apps/webapp run reconcile-person-domain` с нужными `--max-mismatch-percent` и при необходимости `--sample-size` завершается с кодом 0.

Скрипт **stage4-gate** объединяет шаги 2 и 3:

```bash
pnpm run ci && pnpm run stage4-gate
```

Если оба проходят — **go**: домен patient master считается стабилизированным в webapp.

## Критерии no-go (не переходить к следующему этапу)

- CI красный.
- Projection health: `deadCount > 0` или неприемлемый лаг/очередь.
- Reconciliation: выход скрипта с кодом 1 (превышен порог расхождений).

В этих случаях cutover не считать завершённым; следующий домен (Этап 5) не запускать.

## Rollback boundaries (что считается откатом)

1. **Откат по projection:** если после cutover в DLQ появляются мёртвые события (`deadCount > 0`) или лаг не снижается — продолжать использовать webapp как product read/master; проблемные события разбирать/переигрывать вручную или через исправление и повторный прогон worker, без возврата product reads на integrator как canonical source.
2. **Откат по reconciliation:** если отчёт показывает неприемлемые расхождения — сначала устранить причины (backfill, повтор projection, исправление данных), затем снова запустить reconciliation; не отключать projection и не переводить product reads обратно на integrator.
3. **Экстренный откат product reads:** только если по решению команды явно принято временно вернуть чтение person/contact/bindings с webapp на integrator — тогда это отдельное решение с фиксацией причины и срока; скрипты stage4-gate и критерии go/no-go при этом не меняются.

## Что не откатывать

- Таблицы `users` / `identities` / `contacts` / `telegram_state` в integrator не удалять и не переименовывать на этапе 4 (cleanup — поздние этапы).
- Idempotency и projection outbox не отключать; retry и повторная обработка остаются основным способом достижения консистентности.

## Связанные документы

- [DB_ZONES_RESTRUCTURE.md](./DB_ZONES_RESTRUCTURE.md) — Этап 4.
- Детальный implementation plan Stage 4 (patient stabilization) — см. план stage4-patient-stabilization в репозитории.
