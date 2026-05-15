---
name: miniapp-audit-fixes
overview: "Закрыть найденные недочеты по miniapp entry split: укрепить AuthBootstrap, усилить webapp/integrator тестовые контракты, синхронизировать docs/log, отделить repo-DoD от ops-подтверждений и корректно закрыть plan-файл."
status: completed
todos:
  - id: preflight-context
    content: Перечитать релевантный код/доки, снять baseline rg по legacy URL/ctx и уточнить фактический scope перед правками (итог baseline — docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md §Remediation miniapp audit)
    status: completed
  - id: harden-authbootstrap-priority
    content: Сделать route/surface-aware приоритет initData в AuthBootstrap без изменения UX /app и покрыть route-bound MAX/TG тестами
    status: completed
  - id: webapp-test-contracts
    content: Усилить контракты AuthBootstrap.test и platformContext.test, включая routeBoundMiniappEntry и удаление ctx из Location
    status: completed
  - id: integrator-tests-align
    content: Выровнять integrator тесты под /app/tg|/app/max, убрать legacy webapp-entry mock и добавить прямой test для reminderMessengerWebAppUrls
    status: completed
  - id: docs-sync-sub-schema
    content: Синхронизировать INTEGRATOR_CONTRACT и execution log с фактической схемой sub, результатами проверок и remaining ops статусом
    status: completed
  - id: final-ci-and-ops-closeout
    content: Полные проверки + один full CI; ops зафиксированы как partial (ops) в execution log без маскировки под done
    status: completed
  - id: archive-plan-closeout
    content: Перенести план в .cursor/plans/archive и закрыть frontmatter/todos по факту
    status: completed
isProject: false
---

# План исправления всех недочетов miniapp entry split

## Scope и границы
- В scope: только miniapp-entry контур, его тесты и профильная документация.
- Разрешенные области:
  - Webapp auth/middleware/tests: [apps/webapp/src/shared/ui/AuthBootstrap.tsx](apps/webapp/src/shared/ui/AuthBootstrap.tsx), [apps/webapp/src/shared/ui/AuthBootstrap.test.tsx](apps/webapp/src/shared/ui/AuthBootstrap.test.tsx), [apps/webapp/src/modules/auth/messengerAuthStrategy.ts](apps/webapp/src/modules/auth/messengerAuthStrategy.ts), [apps/webapp/src/modules/auth/messengerAuthStrategy.test.ts](apps/webapp/src/modules/auth/messengerAuthStrategy.test.ts), [apps/webapp/src/middleware/platformContext.ts](apps/webapp/src/middleware/platformContext.ts), [apps/webapp/src/middleware/platformContext.test.ts](apps/webapp/src/middleware/platformContext.test.ts), [apps/webapp/src/modules/auth/appEntryClassification.test.ts](apps/webapp/src/modules/auth/appEntryClassification.test.ts).
  - Integrator reminder/link tests: [apps/integrator/src/kernel/domain/executor/executeAction.test.ts](apps/integrator/src/kernel/domain/executor/executeAction.test.ts), [apps/integrator/src/kernel/domain/reminders/reminderMessengerWebAppUrls.ts](apps/integrator/src/kernel/domain/reminders/reminderMessengerWebAppUrls.ts), новый [apps/integrator/src/kernel/domain/reminders/reminderMessengerWebAppUrls.test.ts](apps/integrator/src/kernel/domain/reminders/reminderMessengerWebAppUrls.test.ts), [apps/integrator/src/kernel/domain/executor/handlers/patientHomeMorningPing.test.ts](apps/integrator/src/kernel/domain/executor/handlers/patientHomeMorningPing.test.ts), [apps/integrator/src/integrations/webappEntryToken.ts](apps/integrator/src/integrations/webappEntryToken.ts) только как эталон для проверок.
  - Документация/лог: [apps/webapp/INTEGRATOR_CONTRACT.md](apps/webapp/INTEGRATOR_CONTRACT.md), [docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md](docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md).
  - Plan lifecycle: этот файл после выполнения перенести в [.cursor/plans/archive/](.cursor/plans/archive/) и закрыть frontmatter/todos в репозитории.
- Вне scope: изменение продуктового UX на `/app` (legacy-ветка), изменение host/nginx/system_settings через кодовые migration-потоки, рефактор смежных доменов.
- Не добавлять новые env-переменные для integration config; `max_bot_api_key` проверять/фиксировать только как DB-backed `system_settings` факт в execution log.
- Не добавлять новые e2e-файлы и холодные импорты App Router pages рядом с отдельными кейсами; если потребуется smoke для страниц, расширять только существующий [apps/webapp/e2e/smoke-app-router-rsc-pages-inprocess.test.ts](apps/webapp/e2e/smoke-app-router-rsc-pages-inprocess.test.ts).

## Шаг 0. Preflight и baseline
- Перечитать текущие источники правды перед правками:
  - [docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md](docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md)
  - [.cursor/plans/archive/miniapp_entrypoint_split_be613c6d.plan.md](.cursor/plans/archive/miniapp_entrypoint_split_be613c6d.plan.md)
  - [apps/webapp/INTEGRATOR_CONTRACT.md](apps/webapp/INTEGRATOR_CONTRACT.md)
  - [docs/ARCHITECTURE/MAX_SETUP.md](docs/ARCHITECTURE/MAX_SETUP.md)
  - [docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md](docs/ARCHITECTURE/PLATFORM_IDENTITY_SCENARIOS_AND_CODE_MAP.md)
- Снять baseline поиска, чтобы после правок было с чем сравнить:
  - `rg "webapp-entry|/app\\?ctx|ctx=bot|ctx=max|x-bc-entry-hint" apps docs contracts .cursor/plans/archive`
  - `rg "buildExerciseReminderWebAppUrls|buildWebappEntryUrl|buildWebappEntryUrlForMax|/app/tg|/app/max" apps/integrator/src`
- Зафиксировать в execution log только итог baseline, без больших grep-выводов.

Проверки шага:
- Нет новых находок `x-bc-entry-hint` в runtime-коде.
- Legacy `ctx` встречается только в документации, middleware/test legacy-политике или явно допустимых описаниях старых ссылок.

## Шаг 1. Укрепить runtime-поведение AuthBootstrap (устранить хрупкость выбора initData)
- В [apps/webapp/src/shared/ui/AuthBootstrap.tsx](apps/webapp/src/shared/ui/AuthBootstrap.tsx) сделать route/surface-aware приоритет обработки initData:
  - Для `flowHint === "max"` сначала проверять MAX `initData`, затем Telegram.
  - Для `flowHint === "telegram"` оставить Telegram-first.
  - Для нейтрального browser/legacy оставить текущий безопасный fallback-порядок.
- Цель: убрать теоретическую коллизию, когда на `/app/max` при одновременном наличии двух источников может уйти `telegram-init`.
- Не менять `MESSENGER_HARD_POLL_CAP_MS`, `TICK_MS`, тексты ошибок и текущую политику `/app` legacy; изменение только в выборе канала initData.
- Рекомендуемая форма реализации: небольшая локальная функция внутри эффекта `tick`, например `pickInitDataAttempt(flowHint, rawTg, rawMax)`, возвращающая канал и строку initData. Не выносить в новый shared-модуль без реальной необходимости.

Проверки шага:
- Обновить/добавить unit-кейсы в [apps/webapp/src/shared/ui/AuthBootstrap.test.tsx](apps/webapp/src/shared/ui/AuthBootstrap.test.tsx) на приоритет вызова `max-init` в `max_miniapp` режиме.
- Добавить зеркальный guardrail: при `telegram_miniapp` и наличии обоих initData вызывается `telegram-init`, чтобы изменение не сломало TG-first.
- Прогон: `pnpm --dir apps/webapp exec vitest --run --project=fast src/shared/ui/AuthBootstrap.test.tsx`.

## Шаг 2. Закрыть пробелы тестового контракта webapp
- В [apps/webapp/src/shared/ui/AuthBootstrap.test.tsx](apps/webapp/src/shared/ui/AuthBootstrap.test.tsx):
  - Для кейса `max_miniapp + ?t=` передавать `routeBoundMiniappEntry={true}` (как в production wiring через `AppEntryRsc`).
  - Добавить явную проверку, что при route-bound miniapp не экспонируется интерактивный web-login до cap даже при `NEXT_PUBLIC_AUTH_BOOTSTRAP_EARLY_UI_V2=true`.
  - Проверить, что после cap при `routeBoundMiniappEntry=true` и `?t=` выполняется `POST /api/auth/exchange`, а без `?t=` показывается retry/error, не phone/OAuth.
- В [apps/webapp/src/middleware/platformContext.test.ts](apps/webapp/src/middleware/platformContext.test.ts):
  - Ужесточить кейс `ctx=bot` на `/app`: проверять удаление `ctx` из `Location`.
  - Сохранить и проверить остальные query-параметры при редиректе (симметрично `ctx=max` кейсу).
- В [apps/webapp/src/modules/auth/messengerAuthStrategy.test.ts](apps/webapp/src/modules/auth/messengerAuthStrategy.test.ts), если уже есть подходящий файл, закрепить чистую функцию `shouldExposeInteractiveLogin` для route-bound `max_miniapp`/`telegram_miniapp`: interactive login всегда `false`, пока это explicit entry.

Проверки шага:
- `pnpm --dir apps/webapp exec vitest --run --project=fast src/middleware/platformContext.test.ts src/shared/ui/AuthBootstrap.test.tsx src/modules/auth/appEntryClassification.test.ts`.
- Если менялся [apps/webapp/src/modules/auth/messengerAuthStrategy.ts](apps/webapp/src/modules/auth/messengerAuthStrategy.ts): добавить к команде `src/modules/auth/messengerAuthStrategy.test.ts`.

## Шаг 3. Выровнять integrator tests с каноном `/app/tg|/app/max`
- В [apps/integrator/src/kernel/domain/executor/executeAction.test.ts](apps/integrator/src/kernel/domain/executor/executeAction.test.ts):
  - Убрать legacy-строки `webapp-entry` в моках `buildExerciseReminderWebAppUrls`.
  - Использовать канонический вид `.../app/tg?t=...` или `.../app/max?t=...` + `next=`.
- Добавить прямой unit-test для [apps/integrator/src/kernel/domain/reminders/reminderMessengerWebAppUrls.ts](apps/integrator/src/kernel/domain/reminders/reminderMessengerWebAppUrls.ts):
  - Telegram: формируется `/app/tg?t=...&next=...`
  - MAX: формируется `/app/max?t=...&next=...`
  - Проверка fallback path при некорректном `reminderTargetUrl`.
- В новом тесте мокать [apps/integrator/src/config/appBaseUrl.ts](apps/integrator/src/config/appBaseUrl.ts) и [apps/integrator/src/integrations/webappEntryToken.ts](apps/integrator/src/integrations/webappEntryToken.ts), не трогать реальные env/secrets.
- Проверять URL через `new URL(...)`, а не только `toContain`, где это возможно:
  - `pathname === "/app/tg"` / `"/app/max"`
  - `searchParams.has("t")`
  - `searchParams.get("next")` равен ожидаемому patient path после decode.
- В [apps/integrator/src/kernel/domain/executor/handlers/patientHomeMorningPing.test.ts](apps/integrator/src/kernel/domain/executor/handlers/patientHomeMorningPing.test.ts):
  - Добавить assertion на фактический `web_app.url` в generated payload (а не только на текст/число enqueue).
  - Покрыть как минимум Telegram path; MAX path добавить, если текущий setup файла уже легко задаёт `resource: "max"` без тяжёлого расширения моков.

Проверки шага:
- `pnpm --dir apps/integrator exec vitest --run src/kernel/domain/executor/executeAction.test.ts src/kernel/domain/reminders/*.test.ts src/kernel/domain/executor/handlers/patientHomeMorningPing.test.ts src/integrations/telegram/webhook.links.test.ts src/integrations/max/webhook.links.test.ts`.
- Post-check grep: `rg "webapp-entry" apps/integrator/src/kernel/domain apps/integrator/src/integrations` не должен находить устаревшие mock URL, кроме допустимых названий token contract.

## Шаг 4. Синхронизировать документацию с фактическим token schema
- В [apps/webapp/INTEGRATOR_CONTRACT.md](apps/webapp/INTEGRATOR_CONTRACT.md):
  - Уточнить пример `sub` в Flow 1 до фактических форматов (`tg:<id>` / `max:<id>`), согласованно с [apps/integrator/src/integrations/webappEntryToken.ts](apps/integrator/src/integrations/webappEntryToken.ts) и `contracts/webapp-entry-token.json`.
  - Явно написать, что integrator-ссылка обычно содержит `?t=`, а резервным является порядок потребления на клиенте: `initData` сначала, `exchange` после cap.
- В [docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md](docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md):
  - Добавить отдельный финальный блок remediation для закрытых пунктов (tests hardened, initData priority, docs sync).
  - Снять/обновить формулировки по «не закрыто», когда соответствующие задачи реально закрыты.
  - Не объявлять ops-пункты закрытыми без фактического подтверждения; если подтверждения нет, оставить отдельный статус `partial (ops)` с точным списком.
  - Зафиксировать команды/результаты проверок, но не вставлять большие stdout.

Проверки шага:
- `rg "webapp-entry|sub|/app/tg|/app/max|ctx=bot" apps/webapp/INTEGRATOR_CONTRACT.md docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md`
- Ручная сверка с [apps/integrator/src/integrations/webappEntryToken.ts](apps/integrator/src/integrations/webappEntryToken.ts).

## Шаг 5. Финальная верификация и закрытие хвостов процесса
- Step/phase проверки перед full CI:
  - webapp targeted vitest из шагов 1-2;
  - integrator targeted vitest из шага 3;
  - `pnpm --dir apps/webapp typecheck`
  - `pnpm --dir apps/integrator typecheck`
- Full CI:
  - Выполнить один раз в финале, потому что затронуты webapp + integrator + contract/docs: `pnpm install --frozen-lockfile && pnpm run ci`.
  - Если full CI упал, фиксить конкретный шаг и затем использовать `ci:resume:*` по [test-execution-policy](.cursor/rules/test-execution-policy.md); не гонять полный CI заново на каждой микроитерации.
- Ops-хвосты (вне репозитория; закрываются только подтверждением оператора или прямой проверкой на хосте):
  - MAX Business: статический miniapp URL = `https://bersoncare.ru/app/max`.
  - Telegram/BotFather/menu: miniapp/webapp URL = `https://bersoncare.ru/app/tg`, если это поле используется.
  - Production DB-backed setting: `max_bot_api_key` существует в `system_settings` scope `admin`.
- Если есть доступ к production host, проверка `max_bot_api_key` должна быть copy-paste complete и без вывода секрета:

```bash
set -a && source /opt/env/bersoncarebot/webapp.prod && set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "SELECT CASE WHEN EXISTS (SELECT 1 FROM public.system_settings WHERE scope='admin' AND key='max_bot_api_key' AND value_json IS NOT NULL AND value_json::text NOT IN ('null','\"\"')) THEN 'max_bot_api_key ok' ELSE 'max_bot_api_key missing' END;"
```

- После подтверждения или невозможности проверки обновить execution log как `closed` или `partial (ops)` по факту.

## Шаг 6. Закрыть plan-файл как репозиторный артефакт
- Перенести этот план из `~/.cursor/plans/miniapp-audit-fixes_813ba600.plan.md` в репозиторий:
  - если файл не tracked: `mv ~/.cursor/plans/miniapp-audit-fixes_813ba600.plan.md .cursor/plans/archive/miniapp-audit-fixes_813ba600.plan.md`
  - затем `git add .cursor/plans/archive/miniapp-audit-fixes_813ba600.plan.md`
- Не оставлять stub в `~/.cursor/plans/`.
- После переноса обновить frontmatter в архивном файле:
  - `status: completed`, если repo DoD закрыт и ops либо подтверждены, либо явно оставлены как `partial (ops)` в логе;
  - todos: выполненные `completed`, недоступные ops-подтверждения не маскировать как сделанные; если нет доступа к ops, в todo/content указать `partial (ops): awaiting operator confirmation` и статус по факту работы с репозиторием.
- В теле плана выровнять чеклисты/DoD с фактическими результатами и ссылкой на execution log.

## Definition of Done
### Repo DoD
- [x] Устранена хрупкость initData-приоритета на `/app/max`, без изменения legacy UX `/app`.
- [x] Все найденные webapp тестовые пробелы закрыты автотестами.
- [x] Integrator reminder/link тесты не содержат устаревшего `webapp-entry` mock URL и прямо фиксируют `/app/tg` / `/app/max`.
- [x] [apps/webapp/INTEGRATOR_CONTRACT.md](../../apps/webapp/INTEGRATOR_CONTRACT.md) и [docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md](../../docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md) соответствуют фактической реализации и schema.
- [x] Targeted vitest + app typecheck пройдены.
- [x] `pnpm install --frozen-lockfile && pnpm run ci` пройден после финальных правок (зафиксировано в логе §Remediation miniapp audit) или указан blocker.
- [x] Plan-файл в этом архиве; `status: completed`, todos закрыты; итог baseline и remediation — см. execution log §Remediation miniapp audit.

### Ops Acceptance
Закрытие только по подтверждению на хосте/консолях; текущее состояние зафиксировано как **`partial (ops)`** в execution log §Remediation miniapp audit (MAX URL `/app/max`, Telegram `/app/tg`, `max_bot_api_key`).

- [ ] Полное подтверждение MAX Business URL — до снятия partial.
- [ ] Полное подтверждение Telegram/BotFather URL — до снятия partial.
- [ ] Полная проверка `max_bot_api_key` (блок `psql` в §Шаг 5) — до снятия partial.

**Ссылки:** журнал выполнения [MINIAPP_AUTH_FIX_EXECUTION_LOG.md](../../docs/ARCHITECTURE/MINIAPP_AUTH_FIX_EXECUTION_LOG.md).