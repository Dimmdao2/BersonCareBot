# Final Track D identity + lifecycle audit (#987)

## Тест или взгляд — обязательная классификация (`AGENTS.md` §24.4)

- **Взгляд / итоговое состояние:** полный остаточный поиск retired public `integrator_user_id` / `integratorUserId`,
  различение его от допустимого внутреннего service-principal ID, структура миграций, декларация и сгенерированные
  права, единственность lifecycle/retention roots, окна хранения и неизменность dedup-ledger.
- **Поведение:** бот не создаёт аккаунты; напоминания и callback-операции используют canonical person UUID;
  account/org purge не оставляет identity-bearing копии; playback-retention одним существующим job чистит hourly и
  raw stores по нужным окнам, не скрывает ошибку и не расширяет врачу доступ к таблицам.
- **Живой rollback-only / introspection:** только named DEV, только существующие preflight/proof scripts. Не
  применять миграции, не деплоить и не касаться TEST/PROD.

Ты независимый `auditor-live`. Сначала прочитай карту `AGENTS.md`, затем §1 (миграции и права), §5, §9–§10b и
§24 полностью. Проверяй точный candidate `abed46559` ветки
`wt/fix-lifecycle-purge-census-20260828`; он содержит текущий `feat/doctor-ui-rebuild` `9889cfe27` и пакеты
identity/lifecycle/retention. До чтения существующих тестов запиши компактный blind kill-set. Не редактируй
product-код, UI, env, taskdb, домены и другие ветки; не запускай full CI и не создавай одноразовую базу. Временные
fault injection обязательно откати. Оставить и закоммитить можно только отчёт и одну строку verdict в audit queue;
если новых acceptance-тестов действительно не требуется, не создавай их.

## Authority

Owner decisions и активный системный план:

- `docs/_TODO/SYSTEMIC_RESIDUAL_AUDIT_AND_FIX_PLAN_2026-08-27.md`;
- `docs/_TODO/runs/FINAL_PUBLIC_IDENTITY_CUTOVER_AUDIT_2026-08-28.md` и относящиеся более ранние owner-решения;
- `docs/_TODO/runs/FINAL_EXHAUSTIVE_LIFECYCLE_CENSUS_AUDIT_2026-08-28.md`;
- `docs/_TODO/runs/EXHAUSTIVE_LIFECYCLE_SEMANTICS_FIX_2026-08-28.md`.

Ключевые обязательные решения владельца:

1. Вебхук бота не создаёт пользователя. Регистрация идёт в web-приложении; обычный и брендированный боты
   подтверждают телефон средствами мессенджера, выдают код входа и доставляют обычные уведомления; рассылки —
   только через брендированного бота.
2. Retired public integrator-ID полностью удаляется из live patient/account/reminder/support contracts и файлов
   после cutover. Не путать его с допустимым внутренним ID служебного процесса и не вырезать тот другой ID.
3. Права живут в одной декларации и generated artifacts; миграции не содержат `GRANT`/`REVOKE`. Врач не получает
   широкого чтения технических таблиц: maintenance root выполняет только узкая runtime-роль фонового процесса.
4. Не плодить сущности: намерение/статус/ретрай остаются в существующем пути; не создавать параллельный журнал,
   очередь, scheduler или cleaner.
5. Playback hourly aggregates и HLS errors хранятся 90 дней; raw resolution/client playback events — 400 дней;
   существующий playback-retention job чистит все три playback stores; dedup/idempotency ledger не трогается.
6. Ошибка фоновой очистки не может записываться как успех. Dry-run не удаляет. Live purge атомарен и возвращает
   раздельные измеримые результаты по stores.

## Обязательная проверка

1. Исчерпывающе классифицируй production-упоминания retired public ID. Любой live lookup/write/projection
   пациента, reminder owner/callback, support conversation или account merge через него — blocker. Generated,
   fixtures, migrations и архивы классифицируй отдельно; не объявляй строку live только по имени.
2. Проверь, что canonical messenger bindings обеспечивают login/phone proof/ordinary notifications для обоих
   типов бота, broadcasts остаются branded-only и отсутствие binding создаёт ноль accounts.
3. Проследи reminder CRUD/list/history/statistics/callback operations до canonical `platform_users.id`; numeric
   retired payload и другой user/org должны отвергаться.
4. Для всех вошедших identity/lifecycle migrations проверь owner markers, verify probes, RLS/backfill truth,
   отсутствие прав в SQL и соответствие declaration/generated artifacts. Запусти generator `--check` и только
   уместные targeted gates; уже зелёное evidence на том же SHA не повторяй.
5. Проверь системную lifecycle-реализацию, а не только registry-текст: account/org purge, retained delivery facts,
   rate-limit identity keys, specialist collision fail-closed, outgoing queue/playback/tombstone semantics,
   executable prune roots, rollback-only proof и отсутствие dead token-store declaration.
6. Проверь playback-retention: один существующий scheduler/job; hourly 90, resolution/client raw 400, HLS 90;
   timestamp/index соответствует фильтру; dry-run считает без удаления; live transaction удаляет всё атомарно;
   failure проходит наружу как failure; per-store counts не смешаны; dedup store не включён.
7. Проверь privilege surface: maintenance role имеет только нужные SELECT/DELETE и RLS-доступ к двум raw stores;
   patient insert/read и doctor/clinic roles не расширены. Generated DEV/TEST files должны побайтно совпадать с
   declaration.
8. Для каждого найденного real behavior class используй существующий test или минимальную fault injection. Не
   писать тесты на отсутствие текста. Обязательные injections: возврат bot-side account creation; numeric retired
   reminder owner; widening broadcasts; скрытие retention failure; пропуск одного raw store; включение dedup store;
   снятие maintenance right/RLS policy. Каждый fault обязан красить подходящий gate либо стать конкретным FAIL.
9. Убедись, что все injections откатились, дерево после аудита содержит только разрешённые audit files и candidate
   product SHA не изменён.

## Verdict

Верни ровно `PASS, FOR LAND` или `FAIL, NOT FOR LAND`. Finding существует только для достижимого нарушения owner
requirement/repo-rule/regression: сценарий, impact, точное evidence. Стиль и альтернативная архитектура не finding.
Каждое число — вместе с точной командой. Назови candidate SHA, missed kill-set classes (включая ноль), все
выполненные проверки и факт отката injections.

Отчёт: `docs/_TODO/runs/FINAL_TRACK_D_IDENTITY_RETENTION_AUDIT_2026-08-28.md`.
Очередь: одна строка в `docs/_TODO/NIGHT_WAVE_AUDIT_QUEUE_2026-07-28.md` для candidate `abed46559` с verdict и
путём отчёта. Закоммить только эти разрешённые audit files явными путями, оставь дерево чистым и не заканчивай ход,
пока foreground-команда ещё работает. Прогресс пиши в
`/home/dev/brain/runs/agent-port/final-track-d-identity-retention-audit-20260828.md`.
