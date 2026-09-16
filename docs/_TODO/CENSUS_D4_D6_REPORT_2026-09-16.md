# D4 / D6 — решения по шести открытым адресам

Дата: 2026-09-16. Ветка: `wt/census-d4-d6`.

## Классификация доказательств

- Вызывающие и состав дерева — перепись и отдельный точный поиск по строке пути.
- Выбор «внутрь / дверь / явная метка» — чтение вызывающего и последствие для человека.
- Дверь и метки — итоговая перепись читает тело самого `route.ts`; тест списка адресов или текста
  метки не создавался.
- Регрессии — `tsc --noEmit`, ESLint изменённых TS-файлов, затронутые наборы и production build.

## Исходный и итоговый замер

Команда до изменений и после них одна:

```bash
node tools/census-open-routes.mjs
```

| Состояние | Route-файлов | HTTP-обработчиков | Без двери | С явной меткой | Без метки | Нераспознанных |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Вход | 479 | 596 | 46 | 40 | 6 | 0 |
| Итог | 479 | 596 | 45 | 44 | 1 | 0 |

Единственная итоговая строка `[без метки]` — уже разобранный D5 `public/domains/ask`: метка находится
в реэкспортированном обработчике, а перепись намеренно читает только тело route-файла. Пять адресов D4
больше не являются необъявленными: четыре объявлены публичными, один закрыт дверью.

Для каждого адреса дополнительно выполнены lexical `code-search` и точный поиск по всему checkout:

```bash
node /home/dev/brain/tools/code-search.mjs 'api/version consumer caller fetch version route' --repo bcb -k 12
node /home/dev/brain/tools/code-search.mjs 'api/health webapp health caller integrator' --repo bcb -k 12
node /home/dev/brain/tools/code-search.mjs 'api/media/s3-status caller fetch' --repo bcb -k 12
node /home/dev/brain/tools/code-search.mjs 'api/public/domains/probe caller domainCertificateProbe' --repo bcb -k 12
node /home/dev/brain/tools/code-search.mjs 'api/brand/app-icon mediaId variant caller' --repo bcb -k 12
node /home/dev/brain/tools/code-search.mjs 'api/patient-app/client-boot-report storage rate limit caller' --repo bcb -k 12

rg -l -F --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!**/.next/**' '/api/version' .
rg -l -F --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!**/.next/**' '/api/health' .
rg -l -F --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!**/.next/**' '/api/media/s3-status' .
rg -l -F --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!**/.next/**' '/api/public/domains/probe' .
rg -l -F --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!**/.next/**' '/api/brand/app-icon' .
rg -l -F --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!**/.next/**' '/api/patient-app/client-boot-report' .
```

Число файлов в точном поиске той же командой с `| wc -l`, в порядке выше: `5`, `52`, `3`, `2`,
`6`, `5`. Поиск начинался от `.`, поэтому включал `apps/integrator`, `packages`, `deploy`, `docs`,
`.cursor`, `.github` и `tools`; исключены только `.git`, `node_modules` и build-output `.next`.

## 1. `GET /api/version`

**Вызывающие.** Боевой вызывающий один:
`apps/webapp/src/shared/ui/BuildVersionWatcher.tsx` делает `fetch('/api/version')` из корневого layout.
Он работает и до входа, поэтому сессионная дверь разорвёт автоматическое обновление открытой страницы после
выкладки. Точный поиск во всём дереве дал пять файлов; остальные совпадения — планы/свидетельства.

**Решение: оставить с явной меткой `stampBootstrapPrincipal`.** Это публичная инфраструктурная дверь,
потому что watcher присутствует на каждой поверхности, включая вход. В route-файле поставлена метка
`api/version:GET`. Ответ минимизирован: наружу остаётся только нужный watcher-у `buildId`; неиспользуемый
`startedAt`, раскрывавший время старта процесса, удалён.

**Доказательство.** Итоговая перепись показывает `version` без `[без метки]`; production build включает
`/api/version`. Человеческое последствие сохранено: уже открытый клиент замечает смену сборки и перезагружается.

## 2. `GET /api/health`

**Вызывающие.** Точный поиск дал 52 файла из-за эксплуатационных журналов. Исполняемые потребители в checkout:
`deploy/host/deploy-webapp-prod.sh`, `deploy/host/deploy-test.sh`, `deploy/host/deploy-test-saas.sh` и healthcheck
webapp-контейнера в `deploy/docker/docker-compose.yml`. В `apps/integrator/src/config/env.ts` есть зафиксированный
сетевой контракт внутреннего webapp URL и измерение `/api/health`; отдельного исполняемого `fetch('/api/health')`
в `apps/integrator/src` точный поиск не нашёл. План владельца прямо велит адрес оставить как сетевую дверь
интегратора; внешние runtime-потребители также доказаны deploy/docker-конфигурацией.

**Решение: оставить с явной меткой `stampBootstrapPrincipal`.** В route-файле поставлена метка
`api/health:GET`. Старый ответ `{ ok: true, db: "up" | "down" }` раскрывал имя и состояние зависимости.
Теперь маршрут по-прежнему реально проверяет БД, но отдаёт только общий результат `{ ok: boolean }`: `200` при
готовности и `503` при неготовности. Версий, имён сервисов и состояния именованной зависимости в теле нет.
`deploy-test-saas.sh` больше не требует поля `db`; `curl -f` и `ok=true` сохраняют readiness-gate.

**Доказательство.** Итоговая перепись показывает `health` без `[без метки]`; build зелёный, а deploy path guard
прошёл 10/10. Человеческое последствие сохранено: выкатка и сетевые наблюдатели отличают готовый webapp от
неготового по HTTP-статусу, не получая состав системы.

## 3. `GET /api/media/s3-status`

**Вызывающие.** Единственный боевой вызывающий —
`apps/webapp/src/app/app/doctor/content/library/MediaLibraryClient.tsx`; он выбирает multipart либо fallback перед
загрузкой из уже авторизованной CMS медиатеки. Точный поиск по всему checkout дал три файла: этот вызывающий и две
активные документации. В `apps/integrator` и `packages` совпадений нет; признаков внешнего widget/bot consumer нет.

**Решение: закрыть дверью.** В существующий route добавлена уже используемая соседними media-route дверь
`requireDoctorWorkspaceApiContext`. Наружу больше нельзя узнать, включён ли S3 multipart; авторизованный врач/admin
получает прежний `{ ok, s3Multipart }` и сохраняет рабочий выбор способа загрузки.

**Доказательство.** В итоговой переписи `media/s3-status` отсутствует среди обработчиков без двери.
`apps/webapp/src/app/api/api.md` синхронизирован с новым контрактом. Typecheck, ESLint, затронутый media
chokepoint-набор и build зелёные.

## 4. `GET /api/public/domains/probe`

**Вызывающие.** Боевой путь один:
`domainCertificateProbe.ts` задаёт точный адрес, `realDomainCertificateProbeDeps.ts` делает настоящий
`fetch(https://<hostname>/api/public/domains/probe)`, а `runDomainHealthTick.ts` использует результат для проверки
DNS → TLS → edge/nginx/webapp. Точный поиск дал два файла с литералом; `apps/integrator` и `packages` совпадений не
дали.

**Решение: оставить с явной меткой `stampBootstrapPrincipal`.** Увести эту проверку во внутреннее чтение нельзя:
тогда она перестанет доказывать публичный DNS/TLS/routing путь пользовательского домена. В route-файле поставлена
метка `api/public/domains/probe:GET`. Ответ остаётся secret-free: фиксированный probe id и нормализованный Host.

**Доказательство.** Итоговая перепись показывает маршрут без `[без метки]`; unit/proxy-наборы зелёные.
Последствие для человека: домен клиники не объявляется готовым, пока реальный публичный путь не отвечает тем
самым hostname.

## 5. `GET /api/brand/app-icon/[mediaId]/[variant]`

**Вызывающие.** Боевой генератор URL — `shared/lib/brand/orgAppIcon.ts`; его используют metadata/manifest и
анонимный логотип (`surfaceLayoutMetadata.ts`, `anonymousBrandLogo.ts`). Точный поиск дал шесть файлов.
Внешние потребители принципиальны: favicon/PWA icon и preview-робот мессенджера запрашивают картинку до сессии.

**Решение: оставить с явной меткой `stampBootstrapPrincipal`.** Сессионная дверь даст битые favicon, manifest и
preview на экране до входа. В route-файле поставлена метка `api/brand/app-icon:GET`. Дверь принимает только UUID
media id и один из пяти фиксированных PNG-вариантов, строит ключ только под `org-app-icons/<id>/` и отдаёт готовые
байты PNG; БД и произвольного S3-ключа в запросе нет.

**Доказательство.** Итоговая перепись показывает маршрут без `[без метки]`; PWA/brand-наборы и build зелёные.
Последствие для человека: бренд клиники остаётся виден на входе, установленном приложении и в превью ссылки.

## 6. `POST /api/patient-app/client-boot-report` (D6)

**Вызывающий.** Единственный боевой вызывающий — classic watchdog из
`apps/webapp/src/modules/auth/clientBootWatchdog.ts`. Он нужен до React/auth и потому не может иметь сессионную
дверь. Маршрут уже имел явную метку `stampBootstrapPrincipal`.

**Что принималось и записывалось до исправления.** Тело ограничено `4096` байтами и строгой Zod-схемой:
surface, correlation id до 80 символов, timing, перечислимые характеристики клиента и перечислимые failure
signals; raw UA, stack, token и account id схема не принимает. При включённом feature flag каждый допущенный
запрос сначала мог создать одну строку `public.auth_rate_limit_events` (`scope`, HMAC-псевдоним ключа,
`occurred_at`), затем принятый отчёт создавал один structured `info`-лог. Лимит был 30/IP/час, очистка — не чаще
раза в пять минут, до 500 старых строк за проход. Product analytics, audit и operator-health не записывались.

**Найденный достижимый разрыв.** Публичный отправитель мог ротировать IP: 30/IP не давали общего потолка числу
уникальных ключей, поэтому строки rate-limit и принятые `info`-логи росли без общего предела. После достижения
персонального лимита каждый следующий 429 дополнительно писал `warn`, то есть лог можно было продолжать засорять
даже одним ключом.

**Что сделано.** Существующий единый `createSlidingWindowRateLimit` параметризован опциональным process-local
потолком до persistent port; для этого ingress установлен потолок 300 запросов/час на процесс до обращения к БД.
Поэтому ротация ключей не создаёт больше 300 DB-вызовов/возможных строк и 300 принятых логов на процесс за час.
Отдельный `warn` на каждый 429 удалён: отбитый запрос не создаёт persistent telemetry. Персональный DB-backed
лимит 30/IP/час, HMAC-псевдоним, часовая retention и bounded cleanup сохранены.

**Почему не добавлен тест.** Тест списка путей/наличия метки запрещён §10a. Для числа `300` нет независимого
owner-oracle: тест, который возьмёт или повторит выбранную реализацией константу, закрепит внутреннюю форму и будет
переписываться вместе с кодом. Поведение оставлено независимому адверсарному аудиту ведущего; текущий worker
проверил типы, существующий auth rate-limit набор и сборку.

## Проверки

```text
pnpm --dir apps/webapp exec tsc --noEmit
  rc=0

pnpm --dir apps/webapp exec eslint <8 изменённых TS-файлов>
  rc=0

/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run \
  src/modules/auth/authRateLimits.unit.test.ts \
  src/modules/domain-health/domainCertificateProbe.unit.test.ts \
  src/proxy.productionTenantLookup.route.test.ts \
  src/shared/lib/pwa/patientPwaManifest.unit.test.ts \
  src/app-layer/media/mediaDeliveryChokepointGate.unit.test.ts"
  rc=0; 5 files, 20 tests

/home/dev/brain/host-orch/run-tests.sh \
  "node --test deploy/host/prod-to-target-cutover-path-resolvable.test.mjs"
  rc=0; 10 tests

/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp build"
  rc=0; Next compiled, TypeScript finished, 430/430 static pages generated

node tools/census-open-routes.mjs
  rc=0; 479 route-файлов; 596 методов; 45 без двери; 44 с меткой; 1 без метки; 0 нераспознанных
```

## Коррекция круга 1

Исправлены три `MUST FIX` из `AUDIT_CENSUS_D4_D6_2026-09-16.md`. Галочки D4/D6 не менялись.

### 1. `/api/version` не кодирует время старта

- Fallback `buildId` заменён с `String(Date.now())` на process-local `randomUUID()`. Явные `BUILD_ID` и
  `NEXT_PUBLIC_BUILD_ID` по-прежнему имеют приоритет; Dockerfile и prod deploy plumbing не менялись.
- Route-тест читает настоящий JSON-ответ при пустых build env: поля `startedAt` нет, `buildId` не равен
  зафиксированному времени процесса, стабилен внутри одного module graph и меняется после нового process/module
  graph. Это сохраняет семантику watcher: смена процесса остаётся видна по изменившемуся значению.
- Инъекция: fallback временно возвращён к `String(Date.now())`. Команда
  `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run src/app/api/version/version.route.test.ts"`
  завершилась `rc=1`: `expected '1789553472345' not to be '1789553472345'`. После восстановления тест зелёный.

### 2. Анонимный ответ media-route не зависит от S3

- В девяти найденных аудитом upload-route существующая doctor/patient/multipart дверь перенесена перед
  `isS3MediaEnabled(env)`. Для вошедших пользователей прежний `501 s3_not_configured` сохранён.
- Существующий route acceptance-набор расширен публичной проверкой: те же настоящие handlers вызываются
  анонимно при S3 on и off; весь наблюдаемый ответ (`status` + JSON) совпадает и остаётся `401`.
- Инъекция: в `media/presign` S3-check временно возвращён перед дверью. Команда
  `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run src/modules/media/uploadDoorAcceptance.route.test.ts -t 'returns the same anonymous rejection regardless of S3 configuration'"`
  завершилась `rc=1`: выключенный S3 дал `501 s3_not_configured` вместо `401 unauthorized`. После восстановления
  тест зелёный.
- Повтор точной аудиторской команды порядка дал пустой stdout (`rc=0`): route с
  `isS3MediaEnabled(env)` раньше первой применимой auth-door не осталось.

### 3. Потолок `client-boot-report` стоит до всех DB-backed чтений

- Существующий `createSlidingWindowRateLimit` раскрывает две фазы того же limiter: process-cap и persistent
  per-key check. Единый `checkClientBootReportIngress` теперь выполняет process-cap, затем DB-backed feature flag,
  затем persistent limiter. Route вызывает только этот общий ingress gate.
- Route-тест отправляет 302 запроса через настоящий handler с наблюдаемыми fake-портами. На запросах 1–300 оба
  DB-backed порта вызваны ровно 300 раз; запросы 301 и 302 вернули `429`, а оба счётчика остались равны 300.
- Инъекция: чтение feature flag временно перенесено перед process-cap. Команда
  `/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run src/app/api/patient-app/client-boot-report/clientBootReportIngress.route.test.ts"`
  завершилась `rc=1`: flag DB-port был вызван 302 раза вместо 300. После восстановления тест зелёный.

### Проверки коррекции

```text
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp exec vitest --run \
  src/app/api/version/version.route.test.ts \
  src/modules/media/uploadDoorAcceptance.route.test.ts \
  src/app/api/patient-app/client-boot-report/clientBootReportIngress.route.test.ts"
  rc=0; 3 files, 34 tests

pnpm --dir apps/webapp exec tsc --noEmit
  rc=0

pnpm --dir apps/webapp exec eslint <16 изменённых TS-файлов>
  rc=0

/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp build"
  rc=0; Next compiled, TypeScript finished, 430/430 static pages generated
```

## ВОПРОСЫ ВЛАДЕЛЬЦУ

1. Нужен ли один bounded structured event при первом срабатывании process cap за окно? После порога приложение
   сейчас намеренно не пишет событие на каждый `429`; D6 такого сигнала не требует, поэтому коррекция его не
   добавляла.

## НЕ СДЕЛАНО

- Галочки D4/D6 в `PUBLIC_DOORS_CENSUS_2026-09-16.md` не поставлены — их ставит ведущий после независимого аудита.
- Полный CI не запускался — запрещён brief; его запускает ведущий после landing.
- DEV/TEST/PROD, миграции, БД и общий Next-server не трогались.
- Live UI/runtime не выполнялся: до landing worker не поднимает второй Next-server.
- Повторный независимый аудит и строка вердикта в `feat` не выполнялись автором коррекции.
