# Аудит финального Track D / lifecycle-пакета — 28.08.2026

## Тест или взгляд

Сначала полностью прочитай `AGENTS.md` §10a, §10b и §24. Для каждого пункта ниже до чтения существующих тестов
выбери способ: повторяемое HTTP/side-effect поведение — blind kill-set и самый дешёвый поведенческий тест;
разовое удаление legacy-пути, миграция и соответствие реестра фактам — взгляд по diff, call graph,
owner-aware rollback-only introspection и существующим гейтам. Не пиши тесты текста TypeScript/SQL и не запускай
полный CI.

## Authority и exact candidate

- План: `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`, раздел
  «Финальный свод проверок 28.08 перед последним пакетом исправлений».
- Проверяемый продуктовый коммит: `a394efaa9`, diff от `38311d193`.
- Owner decisions в плане: Track D не зависит в runtime от retired integrator-id; ошибки фоновых процессов не
  скрываются успехом; удаление аккаунта не оставляет raw identity в post-purge audit; append-only журналы
  сохраняют событие, но отпускают ссылку на удалённого actor; clinic admin входит в финальную живую приёмку.

## Scope

Проверь одним связным проходом только:

1. Частичный отказ renewal tick возвращает failure наружу и не пишет зелёный operator tick; полный успех остаётся
   успехом.
2. Account purge больше не вызывает retired-integrator cleanup, не использует retired id как условие удаления и
   не сохраняет phone/raw UUID/retired id/S3 keys/media ids/error text в post-purge audit. Canonical UUID cleanup и
   S3/media external cleanup не сломаны; отключённый S3 при наличии артефактов не считается успехом.
3. Lifecycle registry честно различает физическое удаление `message_log`/`media_files` и anonymisation actor-ссылок.
4. Миграция `20260828T085822_anonymise_audit_actors_on_account_delete.sql` меняет ровно три существующих FK на
   `ON DELETE SET NULL`, выполняется правильным владельцем, не выдаёт права и не требует новой runtime-поверхности
   или индекса. Проверь её owner-aware rollback-only на именованной DEV; никаких disposable DB и execute/apply.
5. Acceptance runner действительно умеет отдельный проход clinic admin через законное clinic membership и не
   придумывает четвёртую platform identity.
6. Проверь, что изменения не возвращают удалённый destructive account route и не расширяют права врача/пациента.

## Границы и результат

- Не менять product-код и не чинить findings. Временные fault injections полностью откатить.
- Разрешено оставить только один audit-report и недостающие acceptance-тесты, если они проходят §10a/§10b.
- Не трогать UI, Therapysto/domain cutover, TEST/PROD, реальные данные, env и taskdb.
- Не запускать full CI; переиспользовать уже зелёные targeted evidence, добирать только точные проверки.
- Отчёт: `docs/_TODO/runs/FINAL_TRACK_D_LIFECYCLE_PACKAGE_AUDIT_2026-08-28.md` с бинарным PASS/FAIL по каждому из
  шести пунктов, kill-set и точной командой рядом с каждым числом. При FAIL оставить падающий acceptance-test либо
  достижимое evidence; рекомендации/стиль не считать finding.
- Перед завершением закоммитить только report и допустимые acceptance-тесты; production tree должен совпадать с
  candidate.
