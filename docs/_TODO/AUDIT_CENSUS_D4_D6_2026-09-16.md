FAIL — 3 MUST FIX

# Независимый адверсарный аудит D4/D6 — шесть открытых адресов

Дата: 2026-09-16. Ветка: `wt/census-d4-d6`. Кандидат: `3825ddce1`.

Источник оракула: `docs/_TODO/PUBLIC_DOORS_CENSUS_2026-09-16.md`, D4 строки 105–110 и D6 строки 111–112.
Отчёт исполнителя использован только после собственного поиска и чтения дерева.

## MUST FIX

### 1. `version` всё ещё раскрывает точное время старта процесса под именем `buildId`

**Строка оракула:** D4 — по каждому адресу выбрать внутреннее чтение, дверь или осознанную публичность; исходное
owner-требование этого плана — внешние двери сокращать до необходимого ответа.

**Достижимый сценарий.** Аноним вызывает `GET /api/version` на новом docker-проде. В
`apps/webapp/src/app/api/version/route.ts:6-14` при отсутствии `BUILD_ID` / `NEXT_PUBLIC_BUILD_ID` возвращается
`String(APP_STARTED_AT)`, то есть Unix-время запуска процесса с точностью до миллисекунды. Удалено только имя поля
`startedAt`, не само значение.

Новый prod не задаёт эти две переменные: `deploy/host/prod/therapysto-deploy:63-68` передаёт Docker только
`GIT_COMMIT` и `BUILD_TIME`; `deploy/docker/Dockerfile:42-51` собирает webapp до объявления этих ARG и сохраняет их
лишь в `/app/.build-id`; `deploy/docker/docker-compose.yml` и `deploy/env/.env.webapp.prod.example` не задают
runtime `BUILD_ID`. Это подтверждено командой:

```bash
rg -n 'BUILD_ID|NEXT_PUBLIC_BUILD_ID|GIT_COMMIT|BUILD_TIME' \
  deploy/docker deploy/host/prod deploy/env/.env.webapp.prod.example
```

**Impact.** Любой внешний наблюдатель получает точный момент рестарта и может измерять внутренние перезапуски/
нестабильность процесса. Watcher-у нужен только непрозрачный меняющийся идентификатор, время старта ему не нужно.
Метка `stampBootstrapPrincipal` эту утечку не ограничивает.

**Что исправить.** Оставить маршрут публичным, но давать ему непрозрачный release/process id: например, корректно
доставить commit/build id в build и runtime нового prod либо использовать случайный process nonce без кодирования
времени. В ответе не должно оставаться точного времени старта ни отдельным полем, ни значением `buildId`.

### 2. Закрытие `media/s3-status` не закрыло внешний оракул наличия S3

**Строка оракула:** D4 — `media/s3-status` должен быть осознанно уведён внутрь, закрыт дверью либо оставлен
публичным только после отдельного решения. Выбранное исполнителем решение — закрыть возможность внешнему клиенту
узнавать `s3Multipart`.

**Достижимый сценарий.** Аноним отправляет POST на один из media upload endpoints. При выключенном S3 маршрут
сразу отвечает `501 s3_not_configured`; при включённом S3 тот же запрос доходит до двери и отвечает `401`.
Следовательно, состояние S3 по-прежнему узнаётся без входа, хотя сам `GET /api/media/s3-status` теперь закрыт.

Собственный поиск порядка «проверка S3 → первая дверь» нашёл **9 маршрутов**; число и список получены этой
командой:

```bash
for f in $(rg -l -F 'isS3MediaEnabled(env)' apps/webapp/src/app/api --glob 'route.ts'); do
  s3_line=$(rg -n -m1 -F 'isS3MediaEnabled(env)' "$f" | cut -d: -f1)
  gate_line=$(rg -n -m1 \
    'await (getCurrentSession|requireDoctorWorkspaceApiContext|requirePatientApiBusinessAccess|requireMediaMultipartApiContext)' \
    "$f" | cut -d: -f1)
  if [ -n "$gate_line" ] && [ "$s3_line" -lt "$gate_line" ]; then printf '%s\n' "$f"; fi
done
```

Результат:

- `api/doctor/treatment-program-instances/[instanceId]/media-presign`;
- `api/patient/media/program-submission/{presign,confirm}`;
- `api/media/{presign,confirm}`;
- `api/media/multipart/{init,part-url,complete,abort}`.

**Impact.** Аноним по HTTP-статусу измеряет внутреннюю конфигурацию хранилища. Это ровно тот факт, который
закрывался у `media/s3-status`; перенос двери только в один адрес оставил девять эквивалентных оракулов.

**Что исправить.** Во всех перечисленных маршрутах дверь должна отвечать раньше проверки конфигурации либо
неаутентифицированный ответ должен быть одинаковым при обоих состояниях S3.

### 3. Потолок `client-boot-report` стоит не до первого обращения к БД

**Строка оракула:** D6 — «принимает отчёт о загрузке от неаутентифицированного клиента. Проверить, что именно
записывается и нельзя ли этим засорять хранилище снаружи».

**Достижимый сценарий.** Каждый запрос с `Content-Type: application/json` и допустимым `Content-Length` сначала
выполняет `getUnsupportedClientFallbackEnabled()` (`client-boot-report/route.ts:69`), а лишь затем вызывает лимитер
(`:73`). Цепочка первого вызова:

```text
getUnsupportedClientFallbackEnabled
→ getPublicRuntimeBool
→ RuntimeConfigPort.getEffective
→ app.read_public_runtime_setting(...) в PostgreSQL
```

Доказательство в дереве: `modules/auth/unsupportedClientFallback.ts:4-5`,
`modules/system-settings/runtimeConfig.ts:265-276`, `infra/repos/pgAppRuntimeSettings.ts:77-92`. Кэша на этом
public-runtime пути нет. Process cap находится только внутри последующего
`createSlidingWindowRateLimit` (`createSlidingWindowRateLimit.ts:116-121`).

**Impact.** После запроса 300 каждый следующий анонимный запрос действительно не пишет rate-limit строку и не
пишет telemetry log, но всё равно делает чтение PostgreSQL. Поэтому атакующий получает неограниченное DB-read
усиление; заявленный предел «300/процесс до обращения к БД» не существует.

**Что исправить.** Process-local ingress cap должен срабатывать до чтения DB-backed feature flag. После правки
проверить не внутренний порядок строк, а наблюдаемое число обращений к DB-порту на запросах 301+.

## Полнота вызывающих

Собственный точный поиск выполнялся по `apps`, `packages`, `deploy`, `.github`, `tools` и docker-конфигурации,
после предварительного lexical `code-search`. Основные команды:

```bash
rg -n --hidden -F '/api/version' apps packages deploy .github tools --glob '!**/*.md'
rg -n --hidden -F '/api/media/s3-status' apps packages deploy .github tools --glob '!**/*.md'
rg -n --hidden -F '/api/public/domains/probe' apps packages deploy .github tools --glob '!**/*.md'
rg -n --hidden -F '/api/brand/app-icon/' apps packages deploy .github tools --glob '!**/*.md'
rg -n --hidden -F '/api/patient-app/client-boot-report' apps packages deploy .github tools --glob '!**/*.md'
rg -n -F 'api/health' deploy tools .github apps packages --glob '!**/*.test.*' --glob '!**/*.md'
rg -n 'service_healthy|State.Health.Status' deploy/docker deploy/host/prod --glob '!**/*.md'
```

Итог по живым путям:

| Адрес | Живой вызывающий / цепочка | Выбор |
| --- | --- | --- |
| `/api/version` | `BuildVersionWatcher.tsx` | HTTP нужен до входа; публичность верна, payload нет — MUST FIX 1 |
| `/api/health` | deploy TEST, старый webapp-prod deploy, TEST post-check, docker healthcheck; далее blue/green gate и media-worker dependency | оставить публичной readiness-дверью |
| `/api/media/s3-status` | `MediaLibraryClient.tsx` | doctor workspace door верна; закрытие неполно — MUST FIX 2 |
| `/api/public/domains/probe` | `domainCertificateProbe.ts` → `realDomainCertificateProbeDeps.ts` → публичный DNS/TLS/route probe | оставить публичной |
| `/api/brand/app-icon/...` | `orgAppIconUrl` → manifest/metadata/anonymous logo | оставить публичной |
| `/api/patient-app/client-boot-report` | classic watchdog из `clientBootWatchdog.ts` | публичность нужна до React/auth; ограничение неполно — MUST FIX 3 |

Отчёт исполнителя не назвал два косвенных потребителя docker healthcheck:

- `deploy/host/prod/therapysto-bluegreen-lib.sh:203-224` читает `State.Health.Status` и отказывается переключать
  nginx при `unhealthy`;
- `deploy/docker/docker-compose.yml:194-202` не запускает `media-worker` до `webapp: service_healthy`.

Это неполнота отчёта, но не отдельный MUST FIX: новое fail-closed поведение для них правильное.

## `/api/health`: все потребители и изменение поведения

- `deploy/host/deploy-webapp-prod.sh`: раньше DB=`down` всё равно давала HTTP 200 и `ok:true`; теперь 503
  останавливает webapp deploy. Это новое, но целевое поведение: сервис с недоступной БД не готов.
- `deploy/host/deploy-test.sh`: оба `curl -f` теперь не выпускают TEST и не запускают media-worker при неготовой
  БД. Это новое и целевое; media-worker зависит от webapp control seam.
- `deploy/host/deploy-test-saas.sh`: смысл не изменился — раньше скрипт отдельно требовал `"db":"up"`, теперь
  тот же отказ обеспечивают 503 через `curl -f` и проверка `"ok":true`.
- `deploy/docker/docker-compose.yml`: 503 переводит webapp container в `unhealthy`; blue/green не переключает
  трафик, `media-worker` не стартует. Это новое и целевое readiness-поведение, не ложная остановка выкладки.

Ответ теперь раскрывает только бинарную готовность `{ ok }`; имён зависимостей нет. Проверка БД — настоящий
`SELECT 1`, а не константа (`apps/webapp/src/infra/db/client.ts:133-170`). MUST FIX по health не найден.

## Публичные ответы: что узнаёт аноним

- `version`: нужен один непрозрачный идентификатор версии, но сейчас на docker-проде это точное время запуска —
  MUST FIX 1.
- `health`: узнаёт только готов/не готов. Это необходимо deploy/container consumers; состав системы не выдаётся.
- `public/domains/probe`: получает фиксированный probe id и нормализованный Host собственного запроса. Маршрут не
  пишет данные; proxy допускает custom-domain probe только в специальном preactivation режиме.
- `brand/app-icon/[mediaId]/[variant]`: получает только готовый публичный PNG из отдельного префикса
  `org-app-icons/<uuid>/<фиксированный вариант>.png`. Произвольный media/S3 key подставить нельзя, записи нет;
  существование можно проверить только для уже известного UUID, по которому сама иконка и предназначена быть
  публичной. Отдельного MUST FIX не найдено.

## `media/s3-status`: дверь и CMS

`requireDoctorWorkspaceApiContext` — та же дверь, что у `api/media/presign`, `api/media/multipart/init`,
`api/media/confirm` и соседних doctor media routes. Она возвращает явные `401/403` response, а не бросает отказ.

CMS не падает от ответа без `s3Multipart`: `MediaLibraryClient.tsx:690-696` безопасно парсит `{}` и выбирает
старый upload fallback. При живой doctor-сессии контракт не меняется; при протухшей сессии fallback тоже
закрывается своей дверью. Проблема не в CMS, а в альтернативных внешних S3-оракулах из MUST FIX 2.

## Потолок D6 и соседние ограничители

Опция `processRequestCap` задана только для `patient.client_boot_report`; остальные вызовы общего
`createSlidingWindowRateLimit` её не передают. Временная route-independent audit-проверка доказала:

- запросы 1–300 client boot доходят до DB limiter, запрос 301 отбивается до него;
- 301 запрос к соседнему `booking.public_create` по-прежнему доходит до его DB limiter;
- удаление строки `if (isProcessRequestLimited()) return true` красит проверку именно на запросе 301.

Команда каждого прогона (только через host lock):

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "pnpm --dir apps/webapp exec vitest --run src/modules/auth/clientBootProcessCap.audit.unit.test.ts"
```

Результаты: current `1 passed`; fault injection `1 failed` (`expected false to be true` на запросе 301);
после восстановления `1 passed`. Временный test-файл удалён, постоянного теста не добавлено.

Законный путь пациента не блокируется: watchdog сначала показывает fallback, затем отправляет fire-and-forget XHR
и не использует HTTP-ответ для входа/навигации. Потеря telemetry после общего потолка не закрывает путь человека.

## Сколько создаёт аноним

При включённом feature flag и ротации IP/ключей один процесс за скользящий час может создать максимум:

- 300 строк `auth_rate_limit_events`;
- 300 принятых structured `info`-логов `unsupported_client_boot` при валидном теле;
- 0 строк и 0 telemetry-логов после process cap.

Эти числа проверены временным прогоном выше: fake DB-port увидел ровно 300 вызовов, запрос 301 до него не дошёл.
Для одного IP persistent threshold дополнительно ограничивает принятые строки/логи числом 30, хотя запросы
31–300 всё ещё вызывают DB limiter. При этом DB-read feature flag остаётся без потолка — MUST FIX 3.

Снятие `warn` на каждый 429 устранило неограниченную запись логов. До потолка остаётся до 300 содержательных
`info`-событий, но после перехода через потолок приложение никак не сообщает продолжительность/объём атаки.

## Собственные инъекции меток

Временно удалены вызовы `stampBootstrapPrincipal` у `health` и `brand/app-icon`; прогон

```bash
/home/dev/brain/host-orch/run-tests.sh "node tools/census-open-routes.mjs"
```

показал оба адреса как `[без метки]`. После восстановления тот же прогон оставил `[без метки]` только у уже
объяснённого re-export `public/domains/ask`; `health` и `brand/app-icon` снова распознаны как объявленные публичные.
Это другие инъекции, не повтор уже выполненных ведущим для `version` и `media/s3-status`.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

1. Нужен ли один bounded structured event при первом срабатывании process cap за окно? Текущая правка правильно
   убирает неограниченный `warn` на каждый 429, но после порога приложение не отличает 301 запрос от длительной
   атаки. В D6 требования к такому сигналу нет, поэтому это не MUST FIX и работа самовольно не расширена.

## Проверки и чистота

- Постоянных тестов и UI-тестов не добавлено.
- DEV/TEST/PROD, миграции и общий Next-server не трогались.
- Полный CI не запускался по прямому запрету brief.
- После всех fault injection production-код восстановлен; `git diff --check` прошёл.
- Итоговая перепись: `479` route-файлов, `596` HTTP-обработчиков, `45` без двери, `0` нераспознанных — точная
  команда: `/home/dev/brain/host-orch/run-tests.sh "node tools/census-open-routes.mjs"`.
