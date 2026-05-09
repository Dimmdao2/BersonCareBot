# STAGE_D — Legacy Cleanup + Global Audit (Composer + Codex)

## Цель

Убрать/минимизировать обязательность legacy migration path и закрыть инициативу с проверяемым финальным аудитом.

## Шаги

1. Найти и обновить все инструкции, где `migrate:legacy` указан как регулярный deploy-шаг.
2. Оставить legacy runner только как явно аварийный/исторический путь (если нужен).
3. Провести global audit: инварианты, риски, остаточные хвосты.
4. Заполнить финальные разделы `LOG.md`: что сделано, что сознательно не делали, какие риски остаются.

## Решения по scope и ролям

### Discovery vs edits

Composer на Stage D делает discovery по всему репозиторию (`rg migrate:legacy`, `rg run-migrations.mjs`, `rg webapp_schema_migrations`), но правки выполняет только в рамках разрешенного scope из `STAGE_PLAN.md` и документации инициативы.

Если найдено упоминание вне scope:

- не править автоматически;
- записать путь и рекомендацию в `LOG.md`;
- передать на Codex final audit/fix.

### Разделение Composer / Codex

- Composer: docs cleanup, inventory residual refs, черновик global audit, residual risks.
- Codex: любые изменения deploy scripts, package scripts, test setup, удаление/переписывание legacy runner, финальное решение "удалять или оставить emergency-only".

Composer не удаляет `migrate:legacy` из тестов, CI, deploy scripts или package scripts без отдельного Codex-approved этапа.

### Что делать с `migrate:legacy`

До закрытия Stage B и Stage C `migrate:legacy` не удалять. На Stage D Composer должен:

- убрать формулировки, где `migrate:legacy` выглядит как регулярный production deploy step;
- оставить/предложить формулировку `emergency/historical only`, если runner еще физически существует;
- записать все живые code references в `LOG.md` как residual refs для Codex.

## Выход этапа

- документация и скрипты согласованы;
- регулярный production flow не зависит от legacy-runner;
- есть прозрачный финальный audit.

## Gate закрытия

- нет противоречий между скриптами и docs;
- завершен global audit;
- все найденные упоминания вне scope записаны в `LOG.md`;
- в `LOG.md` есть финальная запись закрытия инициативы.
