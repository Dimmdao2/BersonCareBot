# Dependency modernization — September 2026

## Authority

Owner, 2026-09-04:

> «Давай ты сам не будешь этим заниматься, а какого-нибудь умного агента запустишь на все эти обновления и
> исправления, чтобы он там учитывал зависимости, всё делал как надо, в нужной последовательности».

## Outcome

Обновить зависимости контролируемыми совместимыми партиями, удалить неподдерживаемую Node-обёртку
`fluent-ffmpeg`, сохранить рабочее поведение приложений и зафиксировать точные блокеры для пакетов, которые нельзя
безопасно поднять до последней версии на текущем Node/Next/runtime.

`latest` не является самостоятельным критерием готовности. Совместимая текущая версия допустима, если следующая
ветка требует неподдерживаемого runtime, ломает публичный контракт или требует отдельного продуктового решения.

## Baseline

Снимок получен командой `pnpm run dependencies:health` 2026-09-04: 24 significant/deprecated позиции:

- toolchain: `@eslint/js`, `eslint`, `typescript`, `vitest`, `@vitest/coverage-v8`, `jsdom`,
  `@testing-library/jest-dom`, `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`, `@types/node`,
  `@types/nodemailer`;
- UI/calendar: `@fullcalendar/core`, `@fullcalendar/react`, `react-day-picker`;
- auth/security/runtime: `@simplewebauthn/browser`, `@simplewebauthn/server`, `argon2`, `jose`, `p-retry`,
  `isomorphic-dompurify`;
- integrations: `@maxhub/max-bot-api`, `googleapis`, `nodemailer`;
- media: deprecated `fluent-ffmpeg`.

## Constraints

- Работать в отдельной ветке `wt/dependency-modernization`; `feat/doctor-ui-rebuild`, `main`, TEST/PROD и живые
  базы не менять.
- Перед каждой группой проверить release notes, peer/engine constraints и фактических потребителей в коде.
- Не делать массовой замены версий без компиляции и целевых проверок конкретной группы.
- Не добавлять тесты на UI-тексты, наличие кнопок, количество табов, DOM или расположение. Допустимы только
  устойчивые поведенческие проверки по `AGENTS.md` §10a–§10b.
- Не исправлять несвязанный код и не проводить визуальный редизайн.
- Не добавлять миграции, не выполнять deploy и не обращаться к PROD.
- Полный CI выполняет лид после независимого аудита и landing; worker запускает только целевые проверки групп.
- Каждый завершённый этап коммитить отдельно явными путями. Не пушить.

## Execution order

### D0 — Compatibility map

- [x] Снять точный workspace-aware inventory командой `pnpm outdated -r --format json` — 2026-09-04 после
  `pnpm install --frozen-lockfile`: 66 outdated всего, 24 significant/deprecated, совпадает с baseline (см.
  «Inventory» ниже).
- [x] Для каждой позиции определить consumers, peer/engine constraints, migration notes и целевую совместимую
  версию — таблица ниже; consumers сняты `rg` по точным import-специфиерам, peers/engines — `npm view <pkg>@<target>
  engines peerDependencies`.
- [x] Обновить этот документ таблицей: package/group, from, target, decision, evidence/blocker — раздел
  «Compatibility matrix» ниже.

#### Inventory

Хост: Node `v22.22.3`, pnpm `10.33.0`, root `engines.node >=22`. Команды:

```bash
pnpm install --frozen-lockfile
pnpm outdated -r --format json
```

⚠️ `pnpm outdated` без установленных `node_modules` отдаёт пустой `current` у каждой позиции, и классификатор
`scripts/dependency-health-check.mjs` признаёт significant только `fluent-ffmpeg` (1 вместо 24). Замер значим
только после install.

#### Compatibility matrix

| Package / group | From | Target | Decision | Evidence / blocker |
|---|---|---|---|---|
| `fluent-ffmpeg` + `@types/fluent-ffmpeg` | 2.1.3 / 2.1.28 | удалены | remove | Единственный consumer — `apps/webapp/src/infra/repos/mediaPreviewWorker.ts`; заменён прямым `spawn` (D1) |
| `eslint`, `@eslint/js` | 9.39.5 | 10.9.1 / 10.0.1 | update | `engines.node ^20.19.0 \|\| ^22.13.0 \|\| >=24` — Node 22.22.3 подходит; `@typescript-eslint/*@8.69.0` peer `eslint ^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0`; `eslint-config-next@16.2.6` peer `eslint >=9.0.0` |
| `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser` | 8.67.0 | 8.69.0 | update (сопутствующее) | Минимальная версия, чей peer допускает `eslint ^10` |
| `typescript` | 5.9.3 | 6.0.3 | update до последней совместимой | `typescript@7.0.2` (latest) **заблокирован**: `@typescript-eslint/*@8.69.0` peer `typescript >=4.8.4 <6.1.0`, ветки 9.x/10.x у typescript-eslint нет (`dist-tags.latest = 8.69.0`) |
| `vitest`, `@vitest/coverage-v8` | 4.1.10 | 5.0.0 | update парой | `engines.node ^22.12.0 \|\| ^24 \|\| >=26` ✓; peer `vite ^6.4 \|\| ^7 \|\| ^8` — в репо `vite 8.2.1` ✓; peer `@types/node ^22 \|\| >=24` ✓; `@vitest/coverage-v8` peer `vitest 5.0.0` — обновлять только вместе |
| `jsdom` | 26.1.0 | 30.0.1 | update + root override | `engines.node ^22.22.2 \|\| ^24.15 \|\| >=26` — Node 22.22.3 проходит впритык; root `pnpm.overrides.jsdom` тоже надо поднять, иначе override держит дерево на 26 |
| `@testing-library/jest-dom` | 6.9.1 | 7.0.1 | update | `engines.node >=22` ✓; peer `vitest >= 0.32`, `@testing-library/dom >=10 <11` ✓ |
| `@stryker-mutator/core`, `@stryker-mutator/vitest-runner` | 9.6.1 | 10.0.0 | update парой | `engines.node >=22` ✓; runner peer `vitest >=2.0.0` и `@stryker-mutator/core 10.0.0` — версии обязаны совпадать |
| `@types/node` | 25.5.2 | 26.4.1 | update | Без engines/peers; типы должны опережать Node 22 API, конфликтов peer нет |
| `nodemailer` + `@types/nodemailer` | 9.0.5 / 7.0.11 | 10.0.0 / **удалён** | update, типы из самого пакета | `engines.node >=20` ✓; consumer один — `apps/integrator/src/integrations/email/mailer.ts` (в `apps/webapp` пакет объявлен, но не импортируется). **Правка D0-оценки:** root override `nodemailer: ">=9.0.5"` мешает — он перекрывает и прямую зависимость, поднят до `>=10.0.0`; 10.0.0 несёт собственные типы, поэтому `@types/nodemailer` удалён, а не обновлён (разбор в D4) |
| `googleapis` | 171.4.0 | 178.0.0 | update | `engines.node >=18` ✓. **Consumers в коде нет**: Google Calendar и в webapp, и в integrator ходит голым `fetch` (`googleOAuthHelpers.ts`, `integrations/google-calendar/client.ts`); пакет объявлен в `apps/integrator/package.json`, но не импортируется |
| `p-retry` | 7.1.1 | 8.0.1 | update | `engines.node >=22` ✓. **Consumers в коде нет** — объявлен в `apps/integrator/package.json`, ни одного import |
| `@maxhub/max-bot-api` | 0.2.2 | 0.3.1 | см. D4 | `engines.node >=20.19.0` ✓; consumers — `apps/integrator/src/integrations/max/{client,deliveryAdapter}.ts` |
| `@simplewebauthn/browser`, `@simplewebauthn/server` | 13.3.0 / 13.3.2 | 14.0.0 | см. D3, только парой | `server engines.node >=20` ✓; 10 consumers в `apps/webapp` (routes, `modules/auth`, `app-layer/auth`, две UI-секции). Алгоритмы и token semantics не трогать |
| `argon2` | 0.44.0 | 0.45.1 | см. D3 | `engines.node >=16.17` ✓; native build (`pnpm.onlyBuiltDependencies`); consumers — `modules/auth/pinHash.ts`, `infra/repos/pgUserPasswordCredentials.ts`. Параметры хеширования не менять |
| `jose` | 5.10.0 | 6.2.11 | см. D3 | Consumer один — `modules/auth/appleOAuthHelpers.ts` (`SignJWT`, `importPKCS8`, `jwtVerify`, `createRemoteJWKSet`); v6 — WebCrypto-only сборка |
| `isomorphic-dompurify` | 3.13.0 | 4.1.0 | см. D3, вместе с jsdom | Зависит от `jsdom ^30.0.0` и `dompurify ^3.4.12`; root overrides сейчас `jsdom ^26.0.0` (блокирует) и `dompurify 3.4.13` (подходит) |
| `react-day-picker` | 9.14.0 | 10.0.1 | см. D5 | peer `react >=16.8`, `@types/react >=16.8` ✓; 3 consumers: `DoctorDateTimePicker.tsx`, `PatientDatePicker.tsx`, `ScheduleCalendarTab.tsx` |
| `@fullcalendar/core`, `@fullcalendar/react` | 6.1.21 | **остаются 6.1.21** | **BLOCKER** | Мажор 7 выпущен только для core и react. У используемых плагинов стабильного 7 нет: `npm view @fullcalendar/daygrid dist-tags` → `latest 6.1.21`, максимум `rc 7.0.0-rc.0`; то же у `timegrid`, `interaction`, `luxon3`. Поднять core/react = развалить пару core↔плагины. Плюс `@fullcalendar/react@7.0.2` тянет новый peer `@full-ui/headless-calendar` и `temporal-polyfill` |

Owner-заметка (не задача, решение за владельцем): `googleapis` и `p-retry` объявлены в `apps/integrator`, но ни
разу не импортируются. Здесь они только обновлены; удаление неиспользуемых зависимостей — отдельное решение.

### D1 — Media wrapper retirement

- [x] Сохранить системный FFmpeg как движок обработки видео — движок не тронут: `FFMPEG_PATH` (канонично
  `/usr/bin/ffmpeg`) по-прежнему единственный исполнитель, изменился только способ его звать
  (`apps/webapp/src/infra/media/ffmpegPreview.ts`).
- [x] Заменить `fluent-ffmpeg` в webapp preview worker на прямой безопасный запуск `ffmpeg`/`ffprobe` без shell,
  переиспользовав или выделив минимальные существующие primitives из `apps/media-worker/src/ffmpeg/**` —
  `apps/webapp/src/infra/media/ffmpegPreview.ts` (`spawn` c `shell: false`, argv массивом).
  **Почему не переиспользован `apps/media-worker/src/ffmpeg/**`** (доказанная граница, не «удобнее своё»):
  1. `apps/webapp` не зависит от `@bersoncare/media-worker`, а тот пакет ничего не экспортирует — это приложение
     без `main`/`exports`, собираемое в `dist` своим `tsconfig.build.json`;
  2. запрет на import исходников соседнего приложения в webapp уже зафиксирован в репозитории —
     `apps/webapp/src/app-layer/integrator/messengerPhoneHttpBindExecute.ts:9` («не импортируем из
     `apps/integrator`, чтобы Next.js production build не тянул исходники с `.js`-специфиерами»);
     `apps/media-worker/src/ffmpeg/*` — ровно такие `.js`-специфиеры;
  3. контракт всё равно другой: вход — пере-подписываемый presigned URL (у media-worker локальный файл + `cwd`),
     качество кадра `-q:v 3` (у media-worker `-q:v 2`), ffprobe нужен для размеров, а не для длительности, и текст
     ошибки обязан нести stderr — на нём держится классификация постоянных ошибок.
  Форма модуля при этом повторяет media-worker (`runProcess` ≈ `runFfmpeg`, `buildPosterArgs` ≈
  `buildPosterFfmpegArgs`), новых слоёв абстракции не заведено.
- [x] Сохранить таймауты, kill, bounded stderr, временные файлы, fallback кадра `1s → 0s`, размеры источника и
  HEIC/ImageMagick fallback — таймаут прежний `FFMPEG_EXTRACT_TIMEOUT_MS = 120_000` + SIGKILL, stderr — хвост
  16 KiB, временный каталог удаляется в `finally`, `videoPosterJpegRaw` по-прежнему пере-подписывает URL и
  повторяет с `-ss 0`, ImageMagick-fallback (`runMagickConvert`) не изменён. Тексты ошибок оставлены дословно как
  у `fluent-ffmpeg` (`ffmpeg exited with code N: <stderr>`, `ffmpeg was killed with signal SIG…`) — на них
  завязан `PERMANENT_ERROR_PATTERNS` (`skipped` vs retry/backoff).
- [x] Удалить `fluent-ffmpeg`, `@types/fluent-ffmpeg` и больше не нужный Next external-package entry — убраны из
  `apps/webapp/package.json`; в `apps/webapp/next.config.ts` `serverExternalPackages` теперь `['sharp']`.
- [x] Проверить целевыми тестами preview MP4/MOV и HEIC paths; не заводить тесты формы исходника — см. «Проверки
  D1» ниже.

#### Проверки D1

```bash
pnpm --dir apps/webapp exec vitest --run --project=unit src/infra/media/ffmpegPreview.unit.test.ts
#   → 14 passed
pnpm --dir apps/webapp exec vitest --run --project=unit src/infra/repos/mediaPreviewWorker.unit.test.ts
#   → 12 passed (было 8; добавлены MP4, MOV с fallback 1s→0s, битый ролик, HEIC)
pnpm --dir apps/webapp typecheck                                  # → OK
/home/dev/brain/host-orch/run-tests.sh "pnpm --dir apps/webapp run lint"   # → rc=0, 203s
```

Живой прогон реального системного `ffmpeg` 6.1.1 (не мок) — сгенерированные `testsrc` MP4 и MOV:

```
src.mp4 dims: {"width":1280,"height":720}   poster exit: 0  bytes: 25594
src.mov dims: {"width":1280,"height":720}   poster exit: 0  bytes: 25594
broken input classified permanent: true     # ffmpegFailureMessage несёт 'Invalid data found when processing input'
```

### D2 — Toolchain

- [x] Обновить совместимую группу ESLint — подняты `@typescript-eslint/eslint-plugin` и
  `@typescript-eslint/parser` 8.67.0 → 8.69.0 и `globals` 17.9.0 → 17.12.0. **Сам `eslint` остаётся 9.39.5 —
  blocker, см. ниже.**
- [x] Обновить совместимую группу Vitest/Coverage/Stryker/Testing Library/jsdom — `vitest` и
  `@vitest/coverage-v8` 4.1.10 → 5.0.0 (во всех четырёх workspace с тестами), `jsdom` 26.1.0 → 30.0.1 (+ root
  override `jsdom: ^30.0.0`), `@testing-library/jest-dom` 6.9.1 → 7.0.1. **Stryker остаётся 9.6.1 — blocker,
  см. ниже.**
- [x] Обновить TypeScript и Node types только до веток, совместимых с текущим Node 22, Next.js и workspace tools —
  `typescript` 5.9.3 → **6.0.3** во всех девяти package.json, `@types/node` 25.5.2 → 26.4.1 в шести. До `7.0.2`
  не поднимаем: peer `@typescript-eslint/*` — `typescript >=4.8.4 <6.1.0`.
- [x] Исправить реальные breaking API/config changes минимально, без ослабления проверок:
  - `apps/webapp/vitest.config.ts` — Vitest 5 вывел `fsModuleCache` из `test.experimental` на верхний уровень
    `test.fsModuleCache`; опция сохранена включённой, кэш не отключался;
  - root `pnpm.overrides` — `fdir>picomatch` и `@dotenvx/dotenvx>picomatch` 4.0.5 → 4.0.7, иначе обновлённый
    `tinyglobby` даёт нерешаемый конфликт peer `picomatch` в дереве.

#### Блокеры D2

**`eslint` 10.9.1 — заблокирован цепочкой `eslint-config-next`.** Последняя совместимая поддерживаемая версия —
`9.39.5` (она же последняя в ветке 9.x). Root-конфиг на ESLint 10 работает, но `apps/webapp` падает жёстко:

```
TypeError: Error while loading rule 'react/display-name':
  contextOrFilename.getFilename is not a function
  at .../eslint-plugin-react@7.37.5/lib/util/version.js:31
```

`eslint-config-next` (и 16.2.6, и 16.3.4) тянет `eslint-plugin-react ^7.37.0`, а у него `dist-tags.latest =
7.37.5` с peer `eslint ^3 … || ^9.7`; поддержка ESLint 10 есть только в пре-релизе `7.8.0-rc.0`. Обходить это
сужением зоны конфига значило бы ослабить проверки — не делаем.

⚠️ Побочный факт для владельца: `eslint@9.39.5` при установке уже помечается upstream как deprecated («This
version is no longer supported»), то есть вся ветка 9.x снята с поддержки. Выход появится, когда
`eslint-plugin-react` выпустит стабильный 7.8.x; до тех пор `pnpm run dependencies:health` будет считать `eslint`
значимой позицией.

**`@stryker-mutator/*` 10.0.0 — заблокирован своим инструментатором.** Оставлен `9.6.1`. Stryker 10 падает до
запуска любого теста, на инструментации первого же файла:

```
INFO ProjectReader Found 1 of 3854 file(s) to be mutated.
ERROR Stryker Unexpected error occurred while running Stryker
  TypeError: Cannot read properties of undefined (reading 'length')
  at Printer._parameters (@babel/generator@8.0.0/lib/index.js:1187)
  at Printer.TSFunctionType ... at print (@stryker-mutator/instrumenter@10.0.0/dist/src/printers/ts-printer.js:3)
```

`@stryker-mutator/instrumenter@10.0.0` перешёл на babel 8 (`@babel/core ~8.0.0`, `@babel/generator ~8.0.0`), и его
TS-принтер не печатает `TSFunctionType`. Проверено, что причина не в наших overrides: снятие точечного пина
`@stryker-mutator/instrumenter>@babel/core: 7.29.6` (он был написан под instrumenter 9 c `~7.29.0`) не помогает, и
принудительный `@babel/parser 8.0.0` в пару к генератору тоже. На 9.6.1 инструментация проходит («Instrumented 1
source file(s) with 224 mutant(s)»), раннер vitest 5 стартует и выполняет прогон. Пин `…>@babel/core: 7.29.6`
поэтому возвращён на место.

Отдельно (не связано с зависимостями, не чинилось): пилот `apps/webapp/stryker.pilot.json` и на 9.6.1 не
доезжает до мутаций — dry-run падает на `ENOENT … runs/stryker-pilot/contracts/webapp-entry-token.json`, тест
читает файл, которого нет в песочнице Stryker.

#### Проверки D2

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm run typecheck"                    # → rc=0 (106s), 9 проектов
/home/dev/brain/host-orch/run-tests.sh "pnpm run lint"                         # → rc=0 (229s)
/home/dev/brain/host-orch/run-tests.sh "pnpm run build && pnpm run build:webapp"  # → rc=0 (272s)
/home/dev/brain/host-orch/run-tests.sh "TEST_CPUSET=0-7 VITEST_MAX_WORKERS=6 \
  TEST_ACCOUNT_PHONES='+12025550101' pnpm run test:webapp"
#   → 494 files passed | 7 skipped; 2583 tests passed | 31 skipped
/home/dev/brain/host-orch/run-tests.sh "TEST_CPUSET=0-7 VITEST_MAX_WORKERS=6 pnpm run test && \
  pnpm run test:scripts && pnpm run test:db-principal && pnpm run test:media-worker && pnpm run test:error-tracking"
#   → integrator 630 passed; scripts 124 passed; db-privileges 31 passed;
#     media-worker 21 passed; error-tracking 13 passed
```

⚠️ `TEST_ACCOUNT_PHONES` задан руками: в этом clone нет `apps/webapp/.env`, поэтому
`passwordAuth.route.test.ts` («allows the env-configured TEST patient password») падает и **на нетронутом
baseline** (проверено `git stash` + `pnpm install --frozen-lockfile` на vitest 4.1.10 — та же 1 ошибка). С
переменной — 17/17 зелёные. Это дефект окружения clone, не регрессия обновления.

### D3 — Auth, security and runtime

Коммит `c72ecca02` (salvage прерванного прохода) проверен целиком и принят как содержимое этапа: версии,
код и тесты соответствуют требованиям ниже; правок по итогам проверки не потребовалось.

- [x] Обновить совместимыми парами SimpleWebAuthn browser/server — `@simplewebauthn/browser` 13.3.0 и
  `@simplewebauthn/server` 13.3.2 подняты до **14.0.0 обеими строками сразу** (`apps/webapp/package.json`).
  Регистрация и проверка credential прогнаны существующими unit/route contracts — см. «Проверки D3».
- [x] Обновить `jose`, `argon2`, `p-retry` и `isomorphic-dompurify` по одному контрактному блоку за раз —
  `jose` 5.10.0 → 6.2.11, `argon2` 0.44.0 → 0.45.1, `isomorphic-dompurify` 3.13.0 → 4.1.0 (webapp),
  `p-retry` 7.1.1 → 8.0.1 (integrator).
- [x] Не менять алгоритмы, параметры хеширования, token semantics или security boundary — проверено против
  реальности, не по release notes (доказательства ниже).

#### Что реально изменилось в API SimpleWebAuthn 14 и почему это безопасно

Единственное breaking-изменение, задевающее наш код: **тип `AuthenticatorTransportFuture` удалён**, и на всех
runtime-границах transports стали `string[]` (`types/index.d.ts`, `generateRegistrationOptions`,
`generateAuthenticationOptions`, `WebAuthnCredential`) — браузер может прислать что угодно, закрытым union это
быть не может.

Словарь transports поэтому переехал в наше хранилище: `PASSKEY_TRANSPORTS` + `parsePasskeyTransports` в
`apps/webapp/src/modules/auth/passkeyStore.ts`. Набор значений — **ровно тот, что принимался до обновления**
(`ble`, `cable`, `hybrid`, `internal`, `nfc`, `smart-card`, `usb`), включая доспецификационные `cable` и
`smart-card`, которые есть у уже зарегистрированных ключей в `passkey_credentials`. Раньше этот фильтр жил
только на чтении (`pgPasskeyStore`), а запись клала `credential.transports ?? []` без фильтра; теперь чтение и
запись ходят через одну функцию (§5 «Один общий проход»), а `pgPasskeyStore` переиспользует её, а не держит
вторую копию списка.

Второе изменение, поведенческое и не требующее правок: у `verifyRegistrationResponse` дефолт
`supportedAlgorithmIDs` сузился с «все поддерживаемые» до `[EdDSA, ES256, RS256]`. Это ровно тот набор, который
`generateRegistrationOptions` и раньше объявлял браузеру по умолчанию, поэтому для ключей, созданных нашим же
flow, поведение не меняется; ужесточение затрагивает только гипотетический аутентификатор, вернувший алгоритм,
которого мы не просили — такая регистрация теперь отклоняется явно.

Клиентский контракт не менялся: `startRegistration({ optionsJSON })` / `startAuthentication({ optionsJSON })`
в 14.0.0 те же (`StaffPasskeySection.tsx`, `PasskeySection.tsx`, `AuthFlowV2.tsx`).

#### Живые проверки D3 (реальные библиотеки, не моки)

`argon2` 0.45.1 — параметры и совместимость хешей. Дефолты в `argon2.cjs` совпадают дословно с 0.44.0:
`hashLength: 32, memoryCost: 1 << 16, parallelism: 4, timeCost: 3`; `pinHash.ts` по-прежнему явно передаёт
`type: argon2.argon2id`. Хеш, созданный **установленным 0.44.0**, проверен установленным 0.45.1:

```
argon2 verify legacy(0.44 hash, правильный pin): true
argon2 verify legacy(неправильный pin):          false
argon2 fresh hash:                               $argon2id$v=19$m=65536,p=4,t=3$…   verify: true
```

То есть существующие `password_hash` и PIN-хеши в базе продолжают проверяться, а новые пишутся с теми же
`m/t/p`. Изменился только порядок перечисления параметров в PHC-строке (`m,p,t` вместо `m,t,p`) — это формат
записи самой библиотеки, парсер читает их по имени; строка-приманка в
`pgPasswordLoginProtection.ts:10` (старый порядок) по-прежнему разбирается и даёт `false`.

`jose` 6.2.11 — путь Apple client secret (`appleOAuthHelpers.ts`) на настоящем ES256-ключе:

```
importPKCS8 → SignJWT(ES256, kid) → jwt (3 сегмента) → jwtVerify(issuer/audience) → OK
protectedHeader { alg: 'ES256', kid: 'KEYID123' }, sub восстановлен
createRemoteJWKSet(new URL(...)) → function
```

`isomorphic-dompurify` 4.1.0 — три consumer’а зовут `sanitize(text, { USE_PROFILES: { html: true } })`:

```
'<p>ok</p><script>alert(1)</script>'      → '<p>ok</p>'
'<img src=x onerror=alert(1)>hi'          → '<img src="x">hi'
'<b>bold</b><a href="https://x.test">l</a>' → без изменений
```

Ручное объявление типов `apps/webapp/src/types/isomorphic-dompurify.d.ts` удалено: 4.1.0 несёт собственные
типы, и `USE_PROFILES` типизирован пакетом (root override `dompurify: 3.4.13` подходит под требуемый
`^3.4.12`, `jsdom ^30.0.0` был поднят ещё в D2 — без него 4.x не встал бы).

`p-retry` 8.0.1 — импортов в коде нет (проверено `rg` по `apps/*/src` и `scripts`), объявлен в
`apps/integrator/package.json`; обновлён без правок кода.

#### Тесты D3

Сохранены три поведенческих проверки в существующем `apps/webapp/src/modules/auth/passkeyAuth.unit.test.ts`
(отдельного файла не заводилось). Это не проверки UI/текста: они идут через публичный
`finishPasskeyRegistration` и фиксируют контракт хранилища, который обязан пережить обновление библиотеки.
Каждая убита персональной инъекцией поломки в продуктовый код (все инъекции откачены):

| Внесённая поломка | Покрасневшее утверждение |
|---|---|
| Словарь сужен до WebAuthn L3 (убраны `cable`, `smart-card`) | «сохраняет доспецификационные cable и smart-card…» — `expected [ 'hybrid' ] to deeply equal [ 'cable', 'smart-card', 'hybrid' ]` |
| Запись без фильтра (`credential.transports ?? []`) | «не кладёт в хранилище значение, которое оттуда всё равно не читается» — `expected [ 'internal', 'нечто', 42 ] to deeply equal [ 'internal' ]` |
| Снят guard `!Array.isArray(value)` | «отсутствие transports не роняет регистрацию» — `expected undefined to deeply equal []` |

Названный отказ у третьей строки конкретен: `pgPasskeyStore.completeRegistration` подставляет
`${JSON.stringify(input.transports)}::jsonb`, поэтому `undefined` вместо `[]` превращается в невалидный SQL и
регистрация ключа падает у аутентификаторов, не сообщающих transports.

#### Проверки D3

```bash
pnpm --dir apps/webapp typecheck                                            # → OK
pnpm --dir apps/webapp exec vitest --run src/modules/auth src/app-layer/auth \
  src/infra/repos/pgPasskeyStore src/infra/repos/pgUserPasswordCredentials \
  src/infra/repos/pgPasswordLoginProtection src/shared/ui/patient/auth
#   → 36 files, 174 tests: 173 passed, 1 failed — passwordAuth.route.test.ts
#     («allows the env-configured TEST patient password»)
TEST_ACCOUNT_PHONES='+12025550101' pnpm --dir apps/webapp exec vitest --run \
  src/modules/auth/passwordAuth.route.test.ts                               # → 17/17 passed
```

⚠️ Единственное падение — тот же дефект окружения clone, что зафиксирован в D2: в этом clone нет
`apps/webapp/.env`, и без `TEST_ACCOUNT_PHONES` тест падает и на нетронутом baseline. С переменной зелёный.

### D4 — Integrations

- [x] Обновить `nodemailer` вместе с типами — коммит `8fe530a1c`: `nodemailer` 9.0.5 → **10.0.0** в
  `apps/webapp` и `apps/integrator`, root `pnpm.overrides.nodemailer` `>=9.0.5` → `>=10.0.0`,
  `@types/nodemailer` **удалён** из обоих приложений.
- [x] Обновить `googleapis` — 171.4.0 → **178.0.0** (`apps/integrator`, коммит `c72ecca02`). Импортов в коде
  нет (перепроверено `rg` по `apps/*/src` и `scripts`): Google Calendar и в webapp, и в integrator ходит голым
  `fetch`. Обновление проверяется установкой, typecheck и build integrator.
- [x] Обновить `@maxhub/max-bot-api` раздельно — 0.2.2 → **0.3.1** (коммит `3c2ca0966`).
- [x] Проверить существующие adapter/unit contracts; не выполнять реальные внешние отправки — все живые
  проверки шли на локальные сокеты `127.0.0.1`, наружу не отправлено ни одного сообщения.

#### nodemailer 10: две вещи, которых не видно из release notes

**Root override держал версию.** `pnpm.overrides.nodemailer: ">=9.0.5"` перекрывает и прямую зависимость
приложения, поэтому после правки `apps/*/package.json` на `^10.0.0` lockfile остался на `9.0.5` — ровно тот же
класс, что у `jsdom` в D2. Порог поднят до `>=10.0.0`, после чего оба приложения получили 10.0.0.

**`@types/nodemailer` больше не нужен и мешает.** Единственный breaking change самого пакета — «Node.js 20 or
newer», но 10.0.0 переписан на TypeScript и **несёт собственные типы** (`dist/cjs/**/*.d.ts`, changelog: «keep
the @types/nodemailer type layout working» — `Mail.Options` и прочие алиасы сохранены). Два источника типов на
один модуль давали неразрешимый вызов `sendMail` (`Property 'accepted' does not exist on type
'Promise<SentMessageInfo> & void'`), поэтому `@types/nodemailer` удалён, а типы берутся из пакета — одна точка
вместо двух (§5).

Собственные типы строже прежних `@types`: опциональные поля объявлены без `| undefined`, а в репозитории
включён `exactOptionalPropertyTypes`. Поэтому в `apps/integrator/src/integrations/email/mailer.ts` поля
`text`, `html`, `replyTo` передаются условным spread — так же, как раньше передавались `attachments`. Проверка
`!== undefined` (а не на truthy) сохраняет прежнее поведение для пустой строки. Больше в mailer ничего не
менялось: транспорт, кеш транспорта по сигнатуре конфига, `from`/`fromName`, вложения и dev-redirect не
тронуты.

Живая проверка SMTP-пути (локальный приёмник на `node:net`, 127.0.0.1, никакой внешней отправки; один
получатель принят, второй отвергнут `550`):

```
accepted:  [ 'ok@example.test' ]
rejected:  [ 'blocked@example.test' ]
messageId: string, начинается с '<'
response:  250 2.0.0 Ok: queued as LOCAL1
```

То есть `SendMailResult` (`accepted` / `rejected` / `messageId`), на котором держится учёт доставки, в 10.0.0
не изменился. Дополнительно через `jsonTransport` проверено, что `replyTo`, вложение `booking.ics`
(`text/calendar`) и `from` с display-name попадают в письмо в прежнем виде.

#### max-bot-api 0.3.1: одно изменение на проводе

Тесты MAX мокают SDK на внешней границе, поэтому совместимость проверена **сравнением фактических HTTP-вызовов**:
один и тот же код прогнан против локального сервера на 0.2.2 и на 0.3.1.

| Метод нашего клиента | 0.2.2 | 0.3.1 |
|---|---|---|
| `getMyInfo` | `GET /me` | `GET /me` |
| `setMyCommands` | `PATCH /me` | **`PATCH /me/commands`** |
| `sendMessageToUser` | `POST /messages?user_id=42` | то же |
| `sendMessageToChat` | `POST /messages?chat_id=7&disable_link_preview=true` | то же |
| `editMessage` | `PUT /messages?message_id=…` | то же |
| `deleteMessage` | `DELETE /messages?message_id=…` | то же |
| `answerOnCallback` | `POST /answers?callback_id=…` | то же |

Тела запросов совпали дословно. Отличается только `setMyCommands`: 0.3.1 зовёт выделенный эндпоинт
(`raw.bots.editMyCommands`) вместо прежнего `editMyInfo`. Наш единственный вызов — `setupMaxCommands()` с
**пустым списком** (снятие slash-меню); ошибка там ловится и логируется `warn` как non-fatal, поэтому даже при
отсутствии нового эндпоинта на платформе последствие ограничено устаревшим меню команд. Проверить это можно
только реальным ключом MAX — вынесено в live-приёмку лида, не в worker.

Классификация «получатель заблокировал бота» не пострадала: форма ошибки идентична в обеих версиях
(`403` c телом `{code:'dialog.suspended'}` → `Error.message = "403: User blocked bot"`, `err.code =
'dialog.suspended'`), то есть подстроки из `MAX_BLOCKED_PATTERNS` на месте.

Побочно: в 0.3.1 `Button` наконец включает `OpenAppButton`, поэтому из `deliveryAdapter.ts` убраны приведения
`as Button` и `as unknown as Button[][]`, существовавшие только из-за пробела в типах 0.2.2 — клавиатура
теперь типизируется без обходов (это доказано typecheck, а не комментарием). Локальный
`MaxOpenAppButtonPayload` оставлен: он строже SDK (`web_app` обязателен).

#### Проверки D4

```bash
pnpm --dir apps/integrator typecheck                                          # → OK
pnpm --dir apps/integrator exec eslint src/integrations/email/mailer.ts        # → rc=0
pnpm --dir apps/integrator exec eslint src/integrations/max/deliveryAdapter.ts # → rc=0
pnpm --dir apps/integrator exec vitest --run src/integrations/email \
  src/integrations/bersoncare/relayOutboundRoute.route.test.ts \
  src/integrations/clinicDeliveryAdapters.unit.test.ts                        # → 26 passed
pnpm --dir apps/integrator exec vitest --run src/integrations/max              # → 13 passed
pnpm --dir apps/webapp typecheck                                              # → OK
```

### D5 — UI libraries

- [x] FullCalendar core/react — **обновления нет, blocker подтверждён повторно 2026-09-04**, пара остаётся на
  6.1.21. `npm view <pkg> dist-tags` сегодня: у `@fullcalendar/daygrid`, `timegrid`, `interaction`, `luxon3`
  `latest = 6.1.21` (7.0.0 существует только как `rc`/`beta`), тогда как у `core`/`react` `latest = 7.0.2`.
  Поднять core/react означало бы развести пару core↔плагины, поэтому «совместимой пары» для мажора 7 не
  существует. Календарные сценарии сохранены тем, что версия не менялась.
- [x] Обновить `react-day-picker` отдельно — 9.14.0 → **10.0.1** (коммит `77d86d95d`), единый doctor
  date-picker contract сохранён (разбор ниже).
- [x] Выполнить type/build checks; UI тестами не закреплять — новых тестов не добавлено, прогнаны только уже
  существующие поведенческие.

#### Почему react-day-picker 10 не задевает наши пикеры

Три consumer’а (`DoctorDateTimePicker.tsx`, `PatientDatePicker.tsx`, `ScheduleCalendarTab.tsx`) используют
`mode`, `locale`, `weekStartsOn`, `selected`, `defaultMonth`, `disabled`, `modifiers`, `modifiersClassNames`,
`onSelect`, `className` плюс импорты `react-day-picker/style.css` и `react-day-picker/locale`.

Мажор 10 состоит из удаления давно deprecated поверхности v8: `fromDate`/`fromMonth`/`fromYear`,
`toDate`/`toMonth`/`toYear`, `initialFocus`, `onWeekNumberClick`, `onDayKeyUp`/`onDayPointerEnter`/
`onDayTouch*`, а также `DeprecatedUI` из типов `classNames`/`styles`. Ничего из этого мы не используем; ни
один из используемых props не изменил тип. Экспорты (`.`, `./style.css`, `./locale`) те же; из зависимостей
ушли только jalali/hijri-календари.

Оформление не поедет: `src/style.css` пакета совпал с 9.14.0 **дословно** (`diff` — 0 строк), набор классов
`rdp-*` идентичен (46 имён), поэтому кастом в `.doctor-day-picker` (`app/styles/doctor.css`) продолжает
попадать в те же селекторы. Живую визуальную приёмку это не заменяет — она за лидом.

#### Проверки D5

```bash
pnpm --dir apps/webapp typecheck                                             # → OK
pnpm --dir apps/webapp exec vitest --run \
  src/app/app/doctor/calendar/DoctorCalendarEventPanel.ui.test.tsx \
  src/app/app/doctor/schedule/tabs/ScheduleCalendarTab.ui.test.tsx           # → 2 files, 21 passed
/home/dev/brain/host-orch/run-tests.sh "pnpm run build:webapp"               # → rc=0, 284s
```

### D6 — Closure

- [x] `pnpm install --frozen-lockfile` проходит на итоговом lockfile — `Lockfile is up to date, resolution
  step is skipped / Already up to date`, rc=0.
- [x] Все целевые проверки этапов зелёные; команды и результаты записаны в этом документе — см. «Проверки
  D1…D5» и «Итоговые проверки» ниже.
- [x] Повторный `pnpm run dependencies:health` не сообщает обновляемые позиции — из 24 значимых осталось
  **7**, и все семь — это четыре уже задокументированных блокера, перепроверенных сегодня (таблица ниже).
- [x] Все изменения закоммичены в `wt/dependency-modernization`; worker не пушит и не сливает ветку.

#### Остаток `dependencies:health` и подтверждение блокеров (2026-09-04)

```
Существенно устарели или deprecated: 7
• @eslint/js 9.39.5 → 10.0.1 · eslint 9.39.5 → 10.10.0
• @fullcalendar/core 6.1.21 → 7.0.2 · @fullcalendar/react 6.1.21 → 7.0.2
• @stryker-mutator/core 9.6.1 → 10.0.0 · @stryker-mutator/vitest-runner 9.6.1 → 10.0.0
• typescript 6.0.3 → 7.0.2
```

| Позиция | Выбранная поддерживаемая версия | Блокер, перепроверенный сегодня |
|---|---|---|
| `eslint`, `@eslint/js` | 9.39.5 / 9.39.5 | `eslint-plugin-react` `dist-tags.latest = 7.37.5` (peer `eslint … \|\| ^9.7`), поддержка ESLint 10 только в `next = 7.8.0-rc.0`; `eslint-config-next@16.3.4` по-прежнему тянет `eslint-plugin-react ^7.37.0` |
| `typescript` | 6.0.3 | `@typescript-eslint/parser` `dist-tags.latest = 8.69.0`, peer `typescript >=4.8.4 <6.1.0`; ветки под TS 7 нет |
| `@stryker-mutator/*` | 9.6.1 | `dist-tags.latest = 10.0.0` — та самая версия, чей instrumenter на babel 8 падает на `TSFunctionType` (разбор в блокерах D2) |
| `@fullcalendar/core`, `@fullcalendar/react` | 6.1.21 | плагины `daygrid`/`timegrid`/`interaction`/`luxon3`: `latest = 6.1.21`, 7.0.0 только `rc`/`beta` |

#### Итоговые проверки (всё дерево после D3–D5)

```bash
/home/dev/brain/host-orch/run-tests.sh "pnpm run typecheck"      # → rc=0, 39s, 7 проектов
/home/dev/brain/host-orch/run-tests.sh "pnpm run lint"           # → rc=0, 276s
/home/dev/brain/host-orch/run-tests.sh "pnpm run build"          # → rc=0, 30s
/home/dev/brain/host-orch/run-tests.sh "pnpm run build:webapp"   # → rc=0, 284s
/home/dev/brain/host-orch/run-tests.sh "TEST_CPUSET=0-7 VITEST_MAX_WORKERS=6 \
  TEST_ACCOUNT_PHONES='+12025550101' pnpm run test:webapp"
#   → 494 files passed | 7 skipped; 2586 tests passed | 31 skipped
/home/dev/brain/host-orch/run-tests.sh "TEST_CPUSET=0-7 VITEST_MAX_WORKERS=6 pnpm run test && \
  pnpm run test:scripts && pnpm run test:db-principal && pnpm run test:media-worker && \
  pnpm run test:error-tracking"
#   → integrator 630 passed (+2 expected fail); scripts 124 passed; db-privileges 31 passed;
#     media-worker 21 passed; error-tracking 13 passed
pnpm install --frozen-lockfile                                   # → rc=0
pnpm run dependencies:health                                     # → 7 значимых, все с блокером выше
```

⚠️ Честно о первом прогоне `test:webapp`: он дал `2 failed | 492 passed`, оба падения — таймаут хука
`beforeAll` на динамическом `await import('./layout')` (`patient/layout.branding.test.ts` и соседний файл), без
единого проваленного утверждения. Повторный прогон той же командой на том же дереве — `494 passed`, 0 падений.
Это контекстная нехватка времени на импорт под нагрузкой хоста, не регрессия обновления; ни один тест не
правился.

#### D0–D2 после мержа `feat/doctor-ui-rebuild`

Ветка `wt/dependency-modernization` содержит merge `a62b7bf42`. Проверено, что этапы D0–D2 после него живы:
`pnpm run typecheck`, `pnpm run lint`, `pnpm run build`, `pnpm run build:webapp` и полный набор тестов выше
зелёные на итоговом дереве; `fluent-ffmpeg` (D1) в дереве отсутствует, версии toolchain из D2
(`typescript 6.0.3`, `vitest 5.0.0`, `jsdom 30.0.1`, `@types/node 26.4.1`) сохранены и подтверждены прогоном.

#### Коммиты этапа

| Коммит | Содержимое |
|---|---|
| `005687302` | D0 — карта совместимости |
| `eae9c8f68` | D1 — отказ от `fluent-ffmpeg` |
| `3347c4ff4` | D2 — toolchain |
| `c72ecca02` | D3 — auth/security/runtime (salvage, проверен и принят в этом проходе) |
| `8fe530a1c` | D4 — nodemailer 10, удаление `@types/nodemailer` |
| `3c2ca0966` | D4 — `@maxhub/max-bot-api` 0.3.1 |
| `77d86d95d` | D5 — `react-day-picker` 10 |

## Lead acceptance

- [ ] Независимый auditor-live проверил diff, dependency compatibility и named behavior risks.
- [ ] Ветка прошла port `land`.
- [ ] На интеграционном SHA выполнен полный `pnpm run ci`, потому что изменяются root tooling, lockfile и несколько
  приложений.
- [ ] После landing выполнена живая проверка media preview и календаря на DEV без внешних отправок.
