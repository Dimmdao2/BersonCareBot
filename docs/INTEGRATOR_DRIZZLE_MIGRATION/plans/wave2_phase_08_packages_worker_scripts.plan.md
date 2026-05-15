---
name: Wave2 Phase08 Packages worker scripts
overview: Пакеты platform-merge и booking-rubitime-sync; apps/media-worker; оставшиеся ops-скрипты webapp — поэтапный перенос или явное оставление на pg с документацией.
status: pending
isProject: false
todos:
  - id: p08-packages
    content: "packages/platform-merge (pgPlatformUserMerge, messengerPhonePublicBind): semver, consumer-тесты webapp/integrator; merge — максимальная осторожность, возможно только +Drizzle обёртки вокруг подзапросов по шагам."
    status: pending
  - id: p08-booking-sync
    content: "packages/booking-rubitime-sync: upsertPatientBookingFromRubitime — Drizzle на public.patient_bookings; проверить потребителей пакета."
    status: pending
  - id: p08-media-worker
    content: "apps/media-worker: введение Drizzle или общего schema-пакета с webapp — отдельное решение в PR (минимум: оставить claim на pg + документировать); цель — убрать дублирование типов запросов с webapp transcode где возможно."
    status: pending
  - id: p08-scripts
    content: "apps/webapp/scripts/* и apps/integrator/scripts/*: классификация «остаётся pg навсегда» vs «оборачиваем в сервис/Drizzle»; для pg-only — одна строка в LOG на скрипт."
    status: pending
  - id: p08-verify
    content: "pnpm typecheck/test для затронутых пакетов; не менять корневой GitHub CI workflow."
    status: pending
---

# Wave 2 — этап 8: пакеты, media-worker, скрипты

## Размер

**L** (накопительно по нескольким артефактам; можно дробить на под-PR по пакету).

## Definition of Done

- [ ] Для каждого затронутого пакета/приложения — зелёные typecheck/test в зоне изменений.
- [ ] Ops-скрипты либо переведены, либо явно помечены как `pg`-only с причиной в LOG.
- [ ] Нет новых env для интеграционных URL/ключей (правила репозитория).

## Scope

**Разрешено:** `packages/platform-merge`, `packages/booking-rubitime-sync`, `apps/media-worker`, `apps/webapp/scripts`, `apps/integrator/scripts` (точечно).

**Вне scope:** массовый рефакторинг без связи с SQL; изменение CI workflow.

## Примечание

Этот этап намеренно **последний**: максимум потребителей и операционных сценариев.
