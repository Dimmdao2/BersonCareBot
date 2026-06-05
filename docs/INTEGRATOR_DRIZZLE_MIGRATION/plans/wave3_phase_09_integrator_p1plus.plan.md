---
name: Wave3 Phase09 Integrator P1plus
overview: Закрыть только оставшиеся после phase08 prod db.query в integrator; не мигрировать на Drizzle код/таблицы, которые phase08 переводит на public или удаляет.
status: pending
isProject: false
todos:
  - id: w3-p09-settings-config
    content: "Settings/config readers после phase08: читать public.system_settings через общий helper + Zod, без integrator mirror."
    status: pending
  - id: w3-p09-repos-simple
    content: "platformUserDeliveryPhone, resolvePlatformUserIdForRubitimeBooking, canonicalUserId → runIntegratorSql (Class B)."
    status: pending
  - id: w3-p09-repos-complex
    content: "idempotencyKeys, adminStats, integrationDataQualityIncidents, patientHomeMorningPing (repo+handler), branchTimezone."
    status: pending
  - id: w3-p09-gcal
    content: "google-calendar calendarDescription, resolvePackageCalendarContext → runIntegratorSql."
    status: pending
  - id: w3-p09-throttle
    content: "rubitimeApiThrottle: throttle row read/update через drizzle session на том же PoolClient (Class B)."
    status: pending
  - id: w3-p09-verify
    content: "rg integrator await db.query (exclude migrate/scripts/client health); integrator tests + typecheck."
    status: pending
---

# Wave 3 — фаза 09: Integrator P1+

## Размер

**M** (после phase08 scope должен уменьшиться; один PR).

## Definition of Done

- [ ] Нет `await db.query` в оставшихся после phase08 prod-файлах (кроме `client.ts` health, `migrate.ts`, scripts).
- [ ] Ни один файл из phase08 `delete/deprecate` или `move-to-public` не «мигрирован ради миграции».
- [ ] `projectionHealthCore.ts` без изменений (Class B) или только комментарий ADR.
- [ ] Кэши `appBaseUrl` / `appTimezone` / invalidation — поведение как до миграции.
- [ ] `branchTimezone` cross-schema join сохранён (qualified `public.*`).
- [ ] `withRubitimeApiThrottle` — те же интервалы и advisory session.
- [ ] Для settings/json границ в файлах фазы нет `JSON.parse(... ) as unknown` без Zod (`safeParse`/`parse`).

## Scope

**Разрешено:** `apps/integrator/src/infra/db/repos/*` (P1+ list), `apps/integrator/src/config/*`, `apps/integrator/src/integrations/google-calendar/*`, `apps/integrator/src/integrations/rubitime/rubitimeApiThrottle.ts`, `apps/integrator/src/kernel/domain/executor/handlers/patientHomeMorningPing.ts`, тесты рядом.

**Вне scope:** `bookingProfilesRepo`, `outgoingDeliveryQueue`, merge repos (уже Wave 2); scripts `resync-*`, `stage6-*`.

## Файловый чеклист (пересмотреть после phase08)

| Файл | Подход |
|------|--------|
| `repos/idempotencyKeys.ts` | `runIntegratorSql` + whitelist |
| `repos/platformUserDeliveryPhone.ts` | `runIntegratorSql` |
| `repos/patientHomeMorningPing.ts` | `runIntegratorSql` |
| `handlers/patientHomeMorningPing.ts` | shared settings helper |
| `repos/adminStats.ts` | `runIntegratorSql`; динамика — Class B |
| `repos/linkedPhoneSource.ts` | `public.system_settings` helper + Zod |
| `repos/resolvePlatformUserIdForRubitimeBooking.ts` | `runIntegratorSql` |
| `repos/canonicalUserId.ts` | `runIntegratorSql` |
| `repos/integrationDataQualityIncidents.ts` | `runIntegratorSql` |
| `branchTimezone.ts` | `runIntegratorSql` join |
| `messengerStaffIds.ts` | `public.system_settings` helper + Zod |
| `adminIncidentAlertRelay.ts` | `public.system_settings` helper + Zod |
| `config/smtpOutbound.ts` | `public.system_settings` helper + Zod |
| `operationalVerboseLog.ts` | settings read |
| `config/appBaseUrl.ts` | settings + cache |
| `config/appTimezone.ts` | settings + cache |
| `gcal/calendarDescription.ts` | `runIntegratorSql` |
| `gcal/resolvePackageCalendarContext.ts` | `runIntegratorSql` |
| `gcal/runtimeConfig.ts` | `public.system_settings` helper + Zod |
| `rubitimeApiThrottle.ts` | `execute` on same client |

## Проверки

```bash
rg 'await db\.query' apps/integrator/src --glob '*.ts' \
  | rg -v 'migrate\.ts|/scripts/|client\.ts'
pnpm --dir apps/integrator run test -- --run idempotency adminStats branchTimezone rubitimeApiThrottle
pnpm --dir apps/integrator run typecheck
```

## Риски

| Риск | Митигация |
|------|-----------|
| Двойной канал settings | Те же таблицы/ключи; не трогать `settingsSyncRoute` write path |
| branchTimezone data-quality | Сохранить fallback + incident hook |
| idempotency dynamic SQL | Тест whitelist + regression |
