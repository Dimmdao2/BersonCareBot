# Исправить единый lifecycle/purge-класс F1–F3 — 28.08.2026

## Authority

Прочитай `AGENTS.md` (карта, §1 migrations, §5, §10a/§10b, §24), затем
`docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md` этап 3 и независимый
`docs/_TODO/runs/FINAL_SYSTEMIC_LIFECYCLE_AUDIT_2026-08-28.md` F1–F3.

Источник оракула: `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md` — «Приёмка этапа:
автоматический census не допускает новую journal/temp таблицу без owner/retention/purge policy; живой account
purge не оставляет ни одного связанного пользовательского факта вне явно сохранённых по закону».

Exact candidate base: `63731f413` на `feat/doctor-ui-rebuild`. Существующие acceptance-tests из audit-коммита
`2fe5fefba` — фиксированный oracle; новых тестов и нового audit-фреймворка не создавать.

## Один цельный результат

Исправь одним согласованным пакетом ровно F1–F3:

1. Production account purge не должен получать `23503` из цепочки
   `platform_users → org_enrollments → manual_patient_commands` ни для одного реального клиента.
2. `patient_diary_day_snapshots`, `patient_practice_completions`, `specialist_tasks.patient_user_id` и
   `manual_patient_commands` не должны переживать purge пациента, если действующая policy не требует их сохранять.
3. Lifecycle census не должен зависеть от удачного суффикса имени и не должен позволять escape-hatch без явного
   purge-решения. Исправь существующий registry/census как единую точку; не добавляй ещё один параллельный список.

Перед новой функцией/обёрткой/списком обязательно ответь в отчёте: можно ли расширить существующие
`JOURNAL_LIFECYCLE_REGISTRY`, `JOURNAL_LIFECYCLE_NON_JOURNAL_DECISIONS`, `CONTENT_TABLES` либо общий declaration
metadata так, чтобы один факт не описывался дважды. Предпочтение — параметризовать существующую точку и удалить
расхождение, а не завести новый обход.

## Ограничения и приёмка

- Работай только в своём clone/branch. Не трогай UI, integrator delivery, auth, Therapysto/domains, env,
  TEST/PROD deploy, taskdb и owner-policy окна.
- Не создавай disposable DB. Пишущая проверка только rollback-only на именованной DEV/TEST по §10b.
- Миграция допустима только если без изменения схемы реально нельзя; тогда соблюсти §1 owner markers, запрет прав,
  письменный rights analysis и owner-aware candidate preflight. Не менять права в миграции.
- Не писать новые тесты: аудитор уже оставил acceptance. Доведи тот же набор до зелёного. Full CI не запускать.
- Минимум evidence: targeted lifecycle unit/contract, существующий rollback-only
  `RUN_PLATFORM_USER_PURGE_DB=1 ...platformUserFullPurge.devDbProof.test.ts`, webapp typecheck, scoped ESLint,
  `git diff --check`. Не объявлять PASS, если opt-in файл был skipped.
- Commit only product/docs files этого bounded fix явными путями; в сообщении указать `#987`, F1–F3, команды и
  что F5/final live не выполнялись. В финальном ответе — SHA, diff summary, точные результаты и NOT DONE.
