# Legacy Cleanup Backlog

**Дата снимка:** 2026-04-17.
**Цель:** зафиксировать все текущие нарушения module isolation для отложенной чистки. Новый код не должен повторять эти паттерны.

## Статусы

- `allowlisted` — в ESLint allowlist, lint проходит. Чистка отложена.
- `tracked-in-track-b` — исторический allowlist: `docs/archive/2026-04-docs-cleanup/test-api-di-optimization/api-di-boundary-normalization/ALLOWLIST_REMAINING_INFRA_ROUTE_IMPORTS.md`.

---

## A. modules/* → getPool() / @/infra/db/client (28 файлов production)

Эти файлы вызывают `getPool()` напрямую вместо получения DB-порта через DI.

| # | Файл | Модуль | Что делает напрямую | Статус |
|---|------|--------|---------------------|--------|
| 1 | `modules/auth/channelLink.ts` | auth | getPool + pgCanonicalPlatformUser + pgPlatformUserMerge | allowlisted |
| 2 | `modules/auth/channelLinkStartRateLimit.ts` | auth | getPool (rate limit check) | allowlisted |
| 3 | `modules/auth/checkPhoneRateLimit.ts` | auth | getPool (rate limit check) | allowlisted |
| 4 | `modules/auth/emailAuth.ts` | auth | getPool (email challenge) | allowlisted |
| 5 | `modules/auth/messengerStartRateLimit.ts` | auth | getPool (rate limit check) | allowlisted |
| 6 | `modules/auth/oauthStartRateLimit.ts` | auth | getPool (rate limit check) | allowlisted |
| 7 | `modules/auth/oauthWebLoginResolve.ts` | auth | getPool + resolveCanonicalUserId | allowlisted |
| 8 | `modules/auth/oauthWebSession.ts` | auth | pgUserByPhonePort напрямую | allowlisted |
| 9 | `modules/auth/oauthYandexResolve.ts` | auth | getPool + findCanonicalUserIdByPhone | allowlisted |
| 10 | `modules/auth/phoneOtpLimits.ts` | auth | getPool (OTP limits) | allowlisted |
| 11 | `modules/auth/yandexOAuthCallbackHandler.ts` | auth | pgUserByPhonePort + pgOAuthBindingsPort | allowlisted |
| 12 | `modules/auth/service.ts` | auth | @/infra/repos imports (types + impls) | allowlisted |
| 13 | `modules/platform-access/resolvePatientCanViewAuthOnlyContent.ts` | platform-access | getPool | allowlisted |
| 14 | `modules/platform-access/patientClientBusinessGate.ts` | platform-access | getPool | allowlisted |
| 15 | `modules/platform-access/resolvePlatformAccessContext.ts` | platform-access | resolveCanonicalUserId from infra | allowlisted |
| 16 | `modules/system-settings/configAdapter.ts` | system-settings | getPool | allowlisted |
| 17 | `modules/system-settings/syncToIntegrator.ts` | system-settings | getPool | allowlisted |
| 18 | `modules/reminders/notifyIntegrator.ts` | reminders | getPool | allowlisted |
| 19 | `modules/patient-home/newsMotivation.ts` | patient-home | getPool ×3 | allowlisted |
| 20 | `modules/patient-home/repository.ts` | patient-home | getPool | allowlisted |
| 21 | `modules/doctor-clients/clientArchiveChange.ts` | doctor-clients | getPool + createPgDoctorClientsPort | allowlisted |
| 22 | `modules/integrator/events.ts` | integrator | 5 port types + mapRubitimeStatus + merge errors from infra | allowlisted |
| 23 | `modules/content-catalog/service.ts` | content-catalog | ContentPagesPort type from infra | allowlisted |
| 24 | `modules/messaging/patientMessagingService.ts` | messaging | SupportCommunicationPort type from infra | allowlisted |
| 25 | `modules/messaging/doctorSupportMessagingService.ts` | messaging | SupportCommunicationPort + row types from infra | allowlisted |
| 26 | `modules/messaging/serializeSupportMessage.ts` | messaging | SupportConversationMessageRow from infra | allowlisted |
| 27 | `modules/menu/service.ts` | menu | ContentSectionRow type from infra | allowlisted |
| 28 | `modules/emergency/service.ts` | emergency | ContentPagesPort type from infra | allowlisted |

### Группировка по модулю

| Модуль | Файлов | Сложность чистки |
|--------|--------|-----------------|
| auth | 12 | High — rate limits, OAuth, merge, canonical user |
| platform-access | 3 | Medium — canonical user resolution |
| system-settings | 2 | Low — configAdapter + sync |
| patient-home | 2 | Low — news/motivation queries |
| messaging | 3 | Low — port type re-export |
| integrator | 1 | High — event processing hub |
| doctor-clients | 1 | Medium — archive + port creation |
| content-catalog | 1 | Low — type import only |
| menu | 1 | Low — type import only |
| emergency | 1 | Low — type import only |
| lessons | 1 | Low — type import only |

### Рекомендуемый порядок чистки (когда будет время)

1. **Type-only imports** (menu, emergency, lessons, content-catalog, messaging) — 6 файлов, Low. Перенести типы портов в `modules/*/ports.ts`.
2. **system-settings, patient-home** — 4 файла, Low-Medium. Создать порты, инжектировать через DI.
3. **platform-access** — 3 файла, Medium. Вынести resolveCanonicalUserId за port.
4. **doctor-clients** — 1 файл, Medium. Убрать createPgDoctorClientsPort внутри модуля.
5. **auth** — 12 файлов, High. Самый крупный блок. Rate limit ports, OAuth ports, canonical user port.
6. **integrator/events** — 1 файл, High. Множественные port-зависимости, нужен рефактор event processing.

---

## B. route.ts → @/infra/* (48 маршрутов)

Полный перечень (архив): `docs/archive/2026-04-docs-cleanup/test-api-di-optimization/api-di-boundary-normalization/ALLOWLIST_REMAINING_INFRA_ROUTE_IMPORTS.md`

Статус: **tracked-in-track-b**. 10 approved-exception (logging), 38 planned-cluster (H/O/R/I/M/D).

---

## C. Enforcement

| Механизм | Что защищает | Файл |
|----------|-------------|------|
| ESLint `no-restricted-imports` | Новый код в `modules/**` | `apps/webapp/eslint.config.mjs` |
| Cursor rule | Агенты при генерации кода | `.cursor/rules/clean-architecture-module-isolation.mdc` |
| Code review | Ручная проверка при PR | — |

**Запрещено:** добавлять новые файлы в ESLint allowlist без явного обоснования и записи в этом документе.
