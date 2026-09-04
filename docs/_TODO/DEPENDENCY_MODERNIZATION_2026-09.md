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

- [ ] Сохранить системный FFmpeg как движок обработки видео.
- [ ] Заменить `fluent-ffmpeg` в webapp preview worker на прямой безопасный запуск `ffmpeg`/`ffprobe` без shell,
  переиспользовав или выделив минимальные существующие primitives из `apps/media-worker/src/ffmpeg/**`.
- [ ] Сохранить таймауты, kill, bounded stderr, временные файлы, fallback кадра `1s → 0s`, размеры источника и
  HEIC/ImageMagick fallback.
- [ ] Удалить `fluent-ffmpeg`, `@types/fluent-ffmpeg` и больше не нужный Next external-package entry.
- [ ] Проверить целевыми тестами preview MP4/MOV и HEIC paths; не заводить тесты формы исходника.

### D2 — Toolchain

- [ ] Обновить совместимую группу ESLint.
- [ ] Обновить совместимую группу Vitest/Coverage/Stryker/Testing Library/jsdom.
- [ ] Обновить TypeScript и Node types только до веток, совместимых с текущим Node 22, Next.js и workspace tools.
- [ ] Исправить реальные breaking API/config changes минимально, без ослабления проверок.

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
