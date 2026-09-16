FAIL — 1 MUST FIX

# Независимый адверсарный аудит D4/D6, круг 2

Дата: 2026-09-16. Ветка: `wt/census-d4-d6`. Кандидат: `4c812a06f`.

Scope: только коррекция трёх MUST FIX из `docs/_TODO/AUDIT_CENSUS_D4_D6_2026-09-16.md`. Уже принятое в круге 1
не переоткрывалось. Authority: `docs/_TODO/PUBLIC_DOORS_CENSUS_2026-09-16.md`, D4/D6, и brief round 2.

## MUST FIX

### 1. `/api/version` больше не отдаёт timestamp, но `buildId` стал process-local и ломает живой watcher

**Строка оракула:** D4 требует оставить публичной только необходимую наружную информацию; brief round 2 отдельно
задаёт: если вкладка начнёт перезагружаться при переключении между процессами одной сборки, это MUST FIX.

**Достижимый сценарий.** Новый docker-prod не задаёт `BUILD_ID` / `NEXT_PUBLIC_BUILD_ID` в runtime: команда

```bash
rg -n --hidden 'BUILD_ID|NEXT_PUBLIC_BUILD_ID|GIT_COMMIT|BUILD_TIME' \
  deploy/docker deploy/host/prod deploy/env apps/webapp/src --glob '!**/*.md'
```

нашла только `GIT_COMMIT`/`BUILD_TIME`, записанные в `/app/.build-id` после `pnpm build`, и чтение env в
`apps/webapp/src/app/layout.tsx:50` / `apps/webapp/src/app/api/version/route.ts:10`. В `deploy/docker/docker-compose.yml`
у `webapp` нет runtime `BUILD_ID`.

При таком окружении `layout.tsx:50-54` кладёт в `<meta name="x-build-id">` пустую строку, а
`api/version/route.ts:7-15` отдаёт `randomUUID()` уровня процесса. Два webapp-процесса одной сборки получают разные
значения. `BuildVersionWatcher.tsx:78-88` сначала принимает первый ответ как baseline, затем при ответе от другого
процесса вызывает `safeReload('version-mismatch', serverBuildId)`. `safeReload.ts:217-264` ограничивает петлю
cooldown/max-count, но всё равно перезагружает живую вкладку до лимита.

**Что отдаёт аноним.** По чтению `api/version/route.ts:21-27` body содержит только поле `{ buildId }`; route явно
ставит только `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`. `NextResponse.json` добавляет
обычный JSON content-type, HTTP server может добавить `Date` текущего ответа; `Age`, счётчиков и restart timestamp
в коде нет. Утечки момента старта больше не найдено, но process UUID не является build id.

**Impact.** Watcher должен перезагружать вкладку при смене версии, а не при балансировке между процессами одной
версии. Сейчас fallback устранил timestamp-утечку ценой ложной смены версии.

**Связанный тестовый дефект (§10a).** `apps/webapp/src/app/api/version/version.route.test.ts:39-41` прямо требует,
чтобы после `vi.resetModules()` `buildId` стал другим. Это не owner-oracle, а закрепление implementation choice.
Честная правка на стабильный release/build id для всех процессов одной сборки потребует менять этот тест; значит
он не проходит линейку владельца (15.09) как самостоятельная защита.

**Что исправить.** Сделать fallback build-level, а не process-level: например, доставлять в runtime тот же commit/build
id, который уже пишется в `/app/.build-id`, или единообразно задавать `BUILD_ID` для webapp при deploy. Тест должен
проверять непрозрачность и отсутствие timestamp, но не требовать различия между процессами одной сборки.

## Проверка пунктов без MUST FIX

### S3-оракул

Сначала был `code-search` по `isS3MediaEnabled media s3 status brand app icon`, затем точные поиски:

```bash
rg -n -F 'isS3MediaEnabled(env)' apps packages deploy .github tools --glob '!**/*.md'
rg -n --hidden -F '/api/media/s3-status' apps packages deploy .github tools --glob '!**/*.md'
rg -n --hidden -F '/api/brand/app-icon/' apps packages deploy .github tools --glob '!**/*.md'
```

Итог:

- `api/media/s3-status/route.ts:6-13` закрыт `requireDoctorWorkspaceApiContext` до `s3Multipart`.
- Девять upload routes теперь сначала отвечают anonymous door (`401`), затем проверяют S3. Собственная инъекция не
  повторяла `media/confirm`: я переставил S3 раньше двери в `api/media/multipart/init/route.ts`, прогон
  `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run src/modules/media/uploadDoorAcceptance.route.test.ts"`
  покраснил ровно `returns the same anonymous rejection regardless of S3 configuration`: `501 s3_not_configured`
  вместо `401`. После отката тот же файл: `32 passed`.
- `api/media/[id]/route.ts:48-51` требует session до ветки `isS3MediaEnabled`.
- `api/brand/app-icon/[mediaId]/[variant]/route.ts` не возвращает capability payload; отсутствие объекта и неуспешный
  S3 read сводятся к `404`.
- Публичный `/{clinicSlug}/media/{mediaId}` отдаёт только опубликованный asset конкретной clinic card. Его наблюдаемые
  `307/404/503` связаны с доставкой конкретного публичного объекта, а не с отдельной anonymous capability-дверью.

Оставшегося generic anonymous признака "S3 настроен / не настроен" не найдено.

### `client-boot-report`

Чтение порядка `apps/webapp/src/app/api/patient-app/client-boot-report/route.ts:55-96`:

1. `stampBootstrapPrincipal` — без DB/network.
2. `ensureAuthModulePortsBound()` — idempotent binding ссылок на ports, без вызова DB (`bindAuthModulePorts.ts:22-40`).
3. Чтение `content-type` и `content-length`; oversized body отсекается по header.
4. `checkClientBootReportIngress(request)` до чтения тела.
5. Внутри ingress: `checkProcessRequestCap()` до `getUnsupportedClientFallbackEnabled()`.
6. Только затем DB-backed flag: `getUnsupportedClientFallbackEnabled` → `getPublicRuntimeBool` →
   `port.getEffective` → `app.read_public_runtime_setting(...)`.
7. Затем persistent limiter DB-port `checkAndRecord`.
8. Только после ingress читается `readBoundedUtf8Body`, `JSON.parse`, Zod и structured `logger.info`.

Собственная инъекция: переставил `checkProcessRequestCap()` после feature flag в
`clientBootReportRateLimit.ts`. Прогон

```bash
/home/dev/brain/host-orch/run-tests.sh \
  "pnpm --dir apps/webapp exec vitest --run src/app/api/patient-app/client-boot-report/clientBootReportIngress.route.test.ts"
```

покраснел: `expected "vi.fn()" to be called 300 times, but got 302 times` на `flagDbRead`. После отката тот же тест
прошёл: `1 passed`.

`readBoundedUtf8Body` не добавил новую работу до потолка: он вызывается только после `ingress === 'ok'`.

### Общий `createSlidingWindowRateLimit`

Точные поиски:

```bash
rg -n "checkProcessRequestCap|checkAfterProcessRequestCap" apps/webapp/src --glob '!**/*.md'
rg -n "instanceof .*RateLimited|JSON\\.stringify\\([^\\n]*(RateLimited|RateLimiter)|Object\\.keys\\([^\\n]*(RateLimited|RateLimiter)|Object\\.assign\\([^\\n]*(RateLimited|RateLimiter)" apps/webapp/src --glob '!**/*.md'
rg -n "is[A-Za-z0-9]*(RateLimited|RateLimitedByKey)\\(" apps/webapp/src/app apps/webapp/src/modules --glob '!**/*.md'
```

Поля `checkProcessRequestCap` / `checkAfterProcessRequestCap` использует только `clientBootReportRateLimit.ts`.
Остальные вызывающие остаются обычными `await limiter(key)` или wrapper-функциями: check-phone, OAuth start,
email OTP, channel link, phone messenger bind, public booking create/confirm, public lead submit, signup-by-email,
specialist duplicate notice, patient invite exchange/email start/email confirm и shared auth confirm.

Поиск `instanceof`/serialization/Object.keys над limiter-значениями пустой. `Object.assign(isRateLimited, ...)`
возвращает ту же callable function; соседние call-sites тип/порядок не меняют.

## Три новых теста по §10a

- `version.route.test.ts` — имеет зубы против timestamp, но дополнительно закрепляет неверный process-local fallback
  (`nextProcess.buildId !== first.buildId`). Это часть MUST FIX 1.
- `clientBootReportIngress.route.test.ts` — проверяет наблюдаемый boundary-effect: после process-cap HTTP `429`, а
  DB-backed flag и limiter port больше не вызываются. Целевая мутация порядка покраснела.
- `uploadDoorAcceptance.route.test.ts` — добавленный случай проверяет конечные HTTP-выходы anonymous callers по
  девяти upload doors при S3 on/off, не текст исходника. Целевая мутация в другом маршруте (`multipart/init`) покраснела.

## ВОПРОСЫ ВЛАДЕЛЬЦУ

Неблокирующий вопрос исполнителя: я за один bounded structured event при первом срабатывании process cap за окно.
Это даст сигнал о длительной атаке без возврата к неограниченному warn на каждый запрос. В D6 такого требования нет,
поэтому это не MUST FIX.

## Проверки

- Базовый targeted run:
  `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run src/app/api/version/version.route.test.ts src/app/api/patient-app/client-boot-report/clientBootReportIngress.route.test.ts src/modules/media/uploadDoorAcceptance.route.test.ts src/modules/auth/authRateLimits.unit.test.ts"`
  → `4 passed`, `35 passed`.
- Fault injection `client-boot-report` order → expected red (`flagDbRead` 302 вместо 300), затем восстановлено →
  `1 passed`.
- Fault injection S3 order in `media/multipart/init` → expected red (`501` вместо `401`), затем восстановлено →
  `32 passed`.
- PROD/TEST/DEV, миграции и Next-server не трогались. Полный CI не запускался по запрету brief.
