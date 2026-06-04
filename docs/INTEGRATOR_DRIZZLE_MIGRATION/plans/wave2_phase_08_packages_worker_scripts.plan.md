---
name: Wave2 Phase08 Packages worker scripts
overview: Пакеты platform-merge и booking-rubitime-sync; apps/media-worker; оставшиеся ops-скрипты webapp — поэтапный перенос или явное оставление на pg с документацией.
status: pending
isProject: false
todos:
  - id: p08-packages
    content: "Под-PR A: packages/platform-merge (pgPlatformUserMerge, messengerPhonePublicBind): semver, consumer-тесты webapp/integrator; merge — максимальная осторожность; Drizzle wrappers добавлять только вокруг доказуемо эквивалентных подзапросов."
    status: pending
  - id: p08-booking-sync
    content: "Под-PR B: packages/booking-rubitime-sync: upsertPatientBookingFromRubitime — Drizzle на public.patient_bookings; проверить потребителей пакета."
    status: pending
  - id: p08-media-worker
    content: "Под-PR C: apps/media-worker: сначала принять schema decision; если нужен общий schema-пакет, остановиться и оформить отдельный план до runtime-кода; claim разрешено оставить на pg/execute(sql) с LOG-причиной."
    status: pending
  - id: p08-scripts
    content: "Под-PR D: apps/webapp/scripts/* и apps/integrator/scripts/*: классификация «остаётся pg навсегда» vs «оборачиваем в сервис/Drizzle»; для pg-only — одна строка в LOG на скрипт."
    status: pending
  - id: p08-verify
    content: "pnpm typecheck/test для затронутых пакетов; не менять корневой GitHub CI workflow."
    status: pending
---

# Wave 2 — этап 8: пакеты, media-worker, скрипты

## Размер

**L** (накопительно по нескольким артефактам; выполнять только под-PR/под-задачами ниже).

## Definition of Done

- [ ] Для каждого затронутого пакета/приложения — зелёные typecheck/test в зоне изменений.
- [ ] Ops-скрипты либо переведены, либо явно помечены как `pg`-only с причиной в LOG.
- [ ] Нет новых env для интеграционных URL/ключей (правила репозитория).

## Scope

**Разрешено:** `packages/platform-merge`, `packages/booking-rubitime-sync`, `apps/media-worker`, `apps/webapp/scripts`, `apps/integrator/scripts` (точечно).

**Вне scope:** массовый рефакторинг без связи с SQL; изменение CI workflow.

## Примечание

Этот этап намеренно **последний**: максимум потребителей и операционных сценариев.

## Обязательная декомпозиция

Не выполнять этап 8 одним PR. Порядок: A `platform-merge` → B `booking-rubitime-sync` → C `media-worker` → D scripts. Каждый под-PR закрывается собственными typecheck/test и записью в LOG; следующий под-PR не должен тащить незакрытые изменения предыдущего.

## Декомпозиция исполнения

### A. `packages/platform-merge`

- [ ] Inventory: `rg "query\\(" packages/platform-merge --glob "*.ts"` и список операций merge/bind.
- [ ] Сначала read-only helpers и self-heal checks; затем write/merge transactions.
- [ ] Сохранить public package API и consumer imports.
- [ ] Для merge transactions использовать минимальные Drizzle wrappers или оставить `pg` с LOG-причиной, если transaction слишком полиморфна.
- [ ] Тесты: package tests, webapp/integrator consumer tests на phone bind / merge conflict / self-heal.
- [ ] Stop condition: при необходимости нового shared schema package закрыть под-PR как design-only и завести отдельный план.

### B. `packages/booking-rubitime-sync`

- [ ] Inventory: `upsertPatientBookingFromRubitime` и связанные writes в `public.patient_bookings`.
- [ ] Проверить потребителей пакета в webapp и integrator.
- [ ] Перевести прямой маппинг на Drizzle без изменения payload normalization.
- [ ] Тесты: create booking, update booking, idempotent external id, missing patient/profile behavior.
- [ ] LOG: какие поля остаются source-of-truth из Rubitime и какие из canonical booking.

### C. `apps/media-worker`

- [ ] До кода принять решение: собственная Drizzle schema, import из webapp schema, или shared schema package.
- [ ] Если shared schema нужен для production-quality решения, не добавлять быстрый дубль без записи trade-off в LOG.
- [ ] Claim transcode jobs сохранить эквивалентным webapp phase 5; `SKIP LOCKED` можно оставить на `pg`/`execute(sql)` с причиной.
- [ ] Тесты: claim one job, complete/fail, retry, no double-claim.
- [ ] Проверки: `pnpm --dir apps/media-worker run typecheck` и tests/build по package scripts.

### D. Scripts

- [ ] Классифицировать каждый script из inventory: runtime business script, one-off ops, migration/backfill, report/compare.
- [ ] One-off ops и migration/backfill могут остаться на `pg`; для каждого оставить строку в LOG с причиной.
- [ ] Runtime business scripts должны вызывать repo/service, а не держать второй SQL-клон.
- [ ] Не менять host env paths и не добавлять новые env для integration config.
- [ ] Проверки: script-specific smoke или dry-run mode, если он уже существует; иначе typecheck/build и LOG с ручной командой.

### Final verification

- [ ] Каждый под-PR имеет отдельный LOG entry и закрытые проверки.
- [ ] `pnpm run typecheck` или более узкие package typecheck по затронутым consumers.
- [ ] Не менять `.github/workflows/*`.
- [ ] Обновить план statuses только по фактически закрытым под-PR.

## Решения по сложным местам

- `platform-merge`: переносить только маленькими эквивалентными участками; при затрагивании merge transaction обязательно запускать tests обоих consumers.
- `booking-rubitime-sync`: не решать дедуп каталогов и не менять source-of-truth; только persistence implementation для текущего payload.
- `media-worker`: быстрый локальный дубль schema запрещён как default. При нехватке schema принять одно из двух решений: shared schema package отдельным планом или оставить `pg` с LOG-причиной.
- Scripts: one-off/backfill/report остаются `pg-only` по умолчанию; runtime scripts должны вызывать общий core/repo.

## Stop conditions

- Если под-PR A меняет public API `platform-merge`, остановиться и оформить semver/consumer migration.
- Если под-PR B требует изменить booking canonical model, остановиться и вынести в booking/dedup initiative.
- Если под-PR C требует shared schema package, не писать runtime-код до отдельного schema-плана.
- Если script не имеет безопасного dry-run/smoke, не менять его SQL без ручного ops-чеклиста в LOG.
