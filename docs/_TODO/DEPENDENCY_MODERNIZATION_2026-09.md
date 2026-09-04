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

- [ ] Снять точный workspace-aware inventory командой `pnpm outdated -r --format json`.
- [ ] Для каждой позиции определить consumers, peer/engine constraints, migration notes и целевую совместимую
  версию.
- [ ] Обновить этот документ таблицей: package/group, from, target, decision, evidence/blocker.

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
