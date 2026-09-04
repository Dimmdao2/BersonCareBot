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
| `nodemailer` + `@types/nodemailer` | 9.0.5 / 7.0.11 | 10.0.0 / 8.0.1 | update парой | `engines.node >=20` ✓; consumer один — `apps/integrator/src/integrations/email/mailer.ts`; root override `nodemailer: ">=9.0.5"` диапазон не мешает |
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

- [ ] Обновить совместимыми парами SimpleWebAuthn browser/server, затем проверить регистрацию и проверку
  credential на уровне существующих unit/route contracts.
- [ ] Обновить `jose`, `argon2`, `p-retry` и `isomorphic-dompurify` по одному контрактному блоку за раз.
- [ ] Не менять алгоритмы, параметры хеширования, token semantics или security boundary без отдельного owner gate.

### D4 — Integrations

- [ ] Обновить `nodemailer` вместе с типами, `googleapis` и `@maxhub/max-bot-api` раздельно.
- [ ] Проверить существующие adapter/unit contracts; не выполнять реальные внешние отправки.

### D5 — UI libraries

- [ ] Обновить FullCalendar core/react одной совместимой парой и сохранить календарные сценарии.
- [ ] Обновить `react-day-picker` отдельно и сохранить единый doctor date-picker contract.
- [ ] Выполнить type/build checks и только необходимую live/визуальную проверку; не закреплять UI тестами.

### D6 — Closure

- [ ] `pnpm install --frozen-lockfile` проходит на итоговом lockfile.
- [ ] Все целевые проверки этапов зелёные; команды и результаты записаны в этом документе.
- [ ] Повторный `pnpm run dependencies:health` не сообщает обновляемые позиции; оставшиеся имеют точный
  compatibility blocker и выбранную поддерживаемую версию.
- [ ] Все изменения закоммичены в `wt/dependency-modernization`; worker не пушит и не сливает ветку.

## Lead acceptance

- [ ] Независимый auditor-live проверил diff, dependency compatibility и named behavior risks.
- [ ] Ветка прошла port `land`.
- [ ] На интеграционном SHA выполнен полный `pnpm run ci`, потому что изменяются root tooling, lockfile и несколько
  приложений.
- [ ] После landing выполнена живая проверка media preview и календаря на DEV без внешних отправок.
