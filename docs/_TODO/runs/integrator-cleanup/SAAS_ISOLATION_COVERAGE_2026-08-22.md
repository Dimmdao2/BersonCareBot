# Монитор изоляции клиник на TEST: почему покрытия нет, с какого дня и что сделано

Дата: 2026-08-22 · ветка `wt/saas-isolation-coverage-20260822` · коммит правки — см. «Что сделано».
План-файл: `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md`. Пункты плана закрывает ведущий;
ниже закрыты только пункты брифа.

## Короткий ответ

1. Производитель покрытия — **не сервис и не крон, а один шаг деплоя**. Его вызов сняли с штатного
   TEST-деплоя `fe7aa07d9` **12.08.2026**; с этого дня штатный код-деплой не пишет покрытие вообще.
2. Оно **работало** — с 16.07 по 12.08. Это регрессия, не «никогда не было».
3. Пустота именно на TEST усилена вторым фактом: базу `bersoncarebot_test` пересоздали **20.08.2026 19:51**,
   и таблицы телеметрии родились пустыми (файл `saas_isolation_coverage_runs` — 0 байт).
4. Зонд `operator_incidents` **не падал**. `status:"error"` — это тяжесть найденного, а не отказ зонда:
   на TEST два открытых инцидента провайдера доставки.
5. Правка сделана только одна — вернуть производителя покрытия штатному деплою через ОДНУ общую точку.
   Всё, что шире, вынесено в «Вопросы ведущему», а не сделано.

## 1. Кто и как должен присылать покрытие (замер, не догадка)

| звено | где |
|---|---|
| CLI-производитель | `apps/webapp/scripts/report-saas-isolation-diagnostics.ts:159` — подкоманда `post-runtime-gate` |
| закрытие гейта | `apps/webapp/src/modules/operator-health/saasIsolationPostRuntimeGate.ts:36` `runSaasIsolationPostRuntimeGate` |
| порт записи | `apps/webapp/src/infra/repos/pgSaasIsolationDiagnostics.ts:30` `recordCoverageAndResolve` |
| SQL | `deploy/postgres/saas-isolation-telemetry.sql:177` `app.record_saas_isolation_coverage` (SECURITY DEFINER, владелец `saas_telemetry_owner`) |
| таблица-приёмник | `public.saas_isolation_coverage_runs` |
| читатель экрана | `apps/webapp/src/app-layer/health/collectAdminSystemHealthData.ts:712` `probeSaasIsolation` |
| роль | EXECUTE на чтение/запись есть только у `saas_telemetry_operator` (проверено `proacl` на TEST) |

**Транспорт — вызов CLI из shell-скрипта деплоя**, не HTTP и не очередь.
**Ожидаемая периодичность — та же, что у деплоя.** Окно свежести — 24 часа
(`SAAS_ISOLATION_COVERAGE_FRESH_HOURS = 24`, `saasIsolationDiagnostics.ts:2`).

**Важно для чтения экрана:** ни один из шести сервисов НЕ отчитывается сам. Одна CLI-запись объявляет
все шесть сразу (`servicesChecked: [...SAAS_ISOLATION_REQUIRED_SERVICES]`, `saasIsolationPostRuntimeGate.ts:56`).
Поэтому «шесть служб в `missingServices`» означает не «шесть молчащих служб», а «записи нет вовсе».

### DEV против TEST — разница НЕ конфигурационная

```
bcb_webapp_dev      : saas_isolation_coverage_runs = 5 строк, последняя finished_at 2026-08-05 04:15
bersoncarebot_test  : saas_isolation_coverage_runs = 0 строк, saas_isolation_events = 0 строк
```

Env, роли и гранты на TEST на месте: зонд `saas_isolation` в журнале вебаппа TEST пишет
`"status":"incomplete"`, а не `"error"` — значит **чтение прошло**, и `lastCoverage: null` честный.
(Это стоило проверить: `collectAdminSystemHealthData.ts:784` `emptySaasIsolationHealthPayload()`
на отказ чтения отдаёт байт-в-байт ту же картину, что и «покрытия нет» — по телу ответа их не различить.)

Причина — не конфигурация, а **снятый вызов производителя**, см. п.2.

## 2. Когда перестало работать

| дата | коммит | что произошло |
|---|---|---|
| 16.07.2026 | `16a910970` | `deploy-test.sh` зовёт `deploy-test-saas.sh --post-migration-closure` |
| 16.07.2026 | `cf6fd984a` | в эту закрывающую последовательность добавлен E1-гейт покрытия |
| **12.08.2026** | **`fe7aa07d9`** | **вызов закрывающей последовательности снят** с `deploy-test.sh` и заменён на разовый `--port-context-post-migration-cutover`. Цель коммита — не пересоздавать операционные логины перед «нулём»; покрытие пострадало заодно |
| 17.08.2026 | `609a19f94` | снят и разовый cutover-вызов. `deploy-test.sh` заканчивается сверкой прав → рестартом → health |
| 20.08.2026 19:51 | — | база `bersoncarebot_test` пересоздана из дампа; таблицы телеметрии пустые |

Проверка: `git log -S"post-migration-closure" -- deploy/host/deploy-test.sh` даёт ровно два коммита
(добавление и снятие). В логах девяти TEST-деплоев 21–22.08 (`/var/log/bersoncarebot/deploy-test/`)
строк `E1`/`saas_isolation` нет ни одной — гейт не запускался.

Единственный оставшийся вызов был в `deploy-test-saas.sh:2024` — а это **движок полного сброса**
(`deploy-test-full-reset.sh`, прямой запуск заблокирован), не штатный код-деплой.

## 3. Зонд `operator_incidents` — почему `error` при непустых данных

Не дефект. `collectAdminSystemHealthData.ts:1133-1139`:

```
operatorIncidentsProbeStatus = !curatedResult.ok ? curatedResult.status
  : outboundProviderIncidents.openCount > 0 ? 'error'
  : operatorIncidents.openCount > 0 ? 'degraded' : 'ok'
```

`error` включает счётчик **инцидентов провайдера доставки**, а не отказ чтения. Живой прогон на TEST:

```sql
SELECT direction, integration, error_class, occurrence_count, last_seen_at
FROM public.operator_incidents WHERE resolved_at IS NULL;
-- outbound_delivery_provider | email    | provider_send_failed | 2 | 2026-08-22 01:24
-- outbound_delivery_provider | telegram | provider_send_failed | 1 | 2026-08-21 18:24
```

Обе строки — `direction = 'outbound_delivery_provider'`, поэтому ветка `error`. Те же две строки дают
`operatorIncidents.openCount: 2` в ответе — «данные есть, а зонд упал» это не два факта, а один и тот же.
Что зонд НЕ падал, видно и по уровню лога: `logProbe` (`:756`) пишет `logger.info` при успехе, и в журнале
TEST строки идут с `"level":30` (info), а не 40 (warn).

**Экран говорит правду:** на TEST реально не уходят письма и телеграм-сообщения (21–22.08).
Это отдельная работа, в мой бриф она не входит.

## 4. Что сделано

Одна правка: **вернуть штатному TEST-деплою производителя покрытия — и только его.**

- новый `deploy/host/saas-isolation-coverage-gate-lib.sh` — общая точка закрытия (AGENTS.md §5).
  `mark_e1_runtime_coverage_start` + `run_e1_post_runtime_coverage_gate <число проверок>`; число
  выполненных проверок стало **параметром** вместо захардкоженной девятки, чтобы каждый вызывающий
  называл своё честное число рядом со своим списком гейтов;
- `deploy-test-saas.sh` — тело закрытия удалено, библиотека подключается `source`, вызов передаёт `9`.
  Поведение движка полного сброса не изменилось: его собственный самотест
  `--strict-closure-catalog-self-test` (прогоняет `run_strict_post_migration_closure` с заглушками) — OK;
- `deploy-test.sh` — `mark_e1_runtime_coverage_start` до рестарта юнитов,
  `run_e1_post_runtime_coverage_gate 9` после того, как TEST ответил здоровым и уже отпущен
  (`SERVICES_RELEASED=1`), то есть красный диагностический гейт не может уронить поднятый TEST.
  Девять проверок этого деплоя: две пробы стены арендатора, сверка прав `reconcile-access`,
  четыре `is-active` по юнитам, два health-эндпоинта;
- `deploy/host/saas-isolation-coverage-gate-lib.test.mjs` — 6 поведенческих тестов;
- `package.json` — `test:scripts` теперь берёт и `deploy/host/*.test.mjs`. Побочно: четыре уже
  существовавших теста в `deploy/host/` **не гонялись ни одним CI-шагом**; теперь гоняются, все зелёные.

**Чего сознательно НЕ сделано:** вся строгая закрывающая последовательность в `deploy-test.sh` НЕ
восстановлена — её остальные гейты пересоздают ровно те операционные логины, ради удаления которых
`fe7aa07d9` её и сняла. Возвращён только производитель покрытия.

## 5. Доказательства

### Тесты поведения, проверенные инъекцией неисправности (§10a)

`node --test deploy/host/saas-isolation-coverage-gate-lib.test.mjs` — 6/6. Каждый тест проверен
арбитром: поломка внесена в код руками, тест покраснел, код восстановлен.

| внесённая поломка | покрасневший тест |
|---|---|
| число проверок снова захардкожено в `9`, параметр игнорируется | `each caller states its own check count…` |
| красный гейт роняет деплой вместо WARN | `a red diagnostic gate warns and leaves the running TEST deploy alive` |
| неотмеченное окно молча подменяется на «сейчас» | `coverage is refused when no window start was marked…` |

### Живой прогон на DEV

Инъекция неисправности — заглушён один производитель (покрытие без `media_worker`):

```json
{ "status": "critical", "statusReasons": ["active_unexplained_event","coverage_services_missing"],
  "coverageComplete": false, "missingServices": ["media_worker"] }
```

Настоящий производитель, ровно та команда, что зовёт деплой
(`diagnostics:saas-isolation -- post-runtime-gate --started-at <iso> --checks 9`):

- первый прогон **отказал** — `saas_isolation_post_runtime_gate_active_unexplained_before_coverage`
  (на DEV висели три активных необъяснённых события от 07–11.08). Это правильное поведение: гейт
  читает живое состояние ДО записи и не является штампом;
- после штатного триажа этих трёх событий (документированная команда `coverage --status complete`) —
  `saas_isolation_post_runtime_gate_ok status=okay coverage=complete active_unexplained=0`.

Итоговое чтение DEV:

```json
{ "status": "okay", "statusReasons": [], "coverageComplete": true,
  "coverageFresh": true, "missingServices": [], "active": {"unexplained":0,"explained":0,"occurrences":0} }
```

Триаж обратим по построению: новое событие того же класса возвращает событие в `active`
(`saas-isolation-telemetry.sql:165` — `lifecycle_status = 'active', resolved_at = NULL`).

### Гейты

| проверка | результат |
|---|---|
| `bash deploy/host/migrate-dev.sh --preflight` | PASS (`pending=0 total=38 verified-objects=82`) |
| `node --test deploy/host/*.test.mjs` | 24/24 |
| `pnpm run test:scripts` | 36/36 |
| `bash deploy/host/deploy-test-saas.sh --strict-closure-catalog-self-test` | OK |
| `bash deploy/host/deploy-test-saas.sh --c4-operational-chain-self-test` | OK |
| `pnpm run audit` | OK |
| `bash -n` × 3 скрипта, `eslint`, `prettier --check` | чисто |

TypeScript не менялся ни строкой — typecheck к этой правке неприменим.

## 6. НЕ СДЕЛАНО и вопросы ведущему

1. **Живой прогон правки на TEST — не мой** (границы брифа: деплой и запись на TEST не мои).
   Вызов в `deploy-test.sh` проверен `bash -n`, ревью и поведенческими тестами общей библиотеки;
   живое доказательство — первый же штатный TEST-деплой: в транскрипте появится
   `E1 post-runtime coverage/read gate: OK`, а `saasIsolation.coverageComplete` станет `true`.
2. **Даже с правкой это не монитор, а отметка деплоя.** Окно свежести 24 часа, а пишет только деплой:
   сутки без деплоя — и экран честно скажет `stale`. Нужен ли периодический производитель (крон раз в
   N часов)? Это новый скоуп — не делал, спрашиваю.
3. **Покрытие — заявление, а не опрос.** Одна запись объявляет все шесть служб проверенными;
   `checksCount` — число, которое называет вызывающий. Ни одна служба не подтверждает своё покрытие
   сама. Если экран должен означать «каждая из шести проверена», это отдельная работа.
4. **Ноль событий изоляции на TEST** (`saas_isolation_events` пуст) — при 1241 занесении на DEV.
   Гранты на запись у `app_staff`/`app_worker`/`app_patient` на TEST есть, ошибок
   `saas_isolation_telemetry_persist_failed` в журнале за неделю нет. Скорее всего честная тишина
   двухдневной базы, но проверкой это не подтверждено — отдельный вопрос.
5. **Два открытых инцидента доставки на TEST** (email + telegram, 21–22.08) — п.3 выше. Не чинил.
