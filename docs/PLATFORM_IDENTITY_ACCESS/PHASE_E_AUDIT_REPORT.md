# Фаза E — аудит закрытия DoD §1–§4 и §8

**Дата:** 2026-04-11  
**Основание:** [`MASTER_PLAN.md`](MASTER_PLAN.md) §3 (DoD), §5 (фаза E), [`SCENARIOS_AND_CODE_MAP.md`](SCENARIOS_AND_CODE_MAP.md) §3–§6 (сценарии), §9 (наблюдаемость), §11 (чек-лист).

**Вердикт (первичный аудит):** **DoD §1, §2, §4 и §8 закрыты** совокупно фазами A–D и фазой E (тесты + `[platform_access]`-логи + актуализация журнала). **DoD §3** для REST/actions/RSC — закрыт; единственный зафиксированный затем хвост **D-SA-1** снят в **повторном аудите** — см. [`PHASE_E_REAUDIT_REPORT.md`](PHASE_E_REAUDIT_REPORT.md) и `patientOnboardingServerActionSurfaceOk`.

**CI:** `pnpm run ci` — зелёный на момент аудита (2026-04-11).

---

## 1. DoD §1 — три модуля

| Модуль | Путь | Статус |
|--------|------|--------|
| Access context / tier | `apps/webapp/src/modules/platform-access/resolvePlatformAccessContext.ts`, `types.ts` | Внедрён; единая точка для `tier` / `phoneTrustedForPatient` |
| Trusted phone policy | `apps/webapp/src/modules/platform-access/trustedPhonePolicy.ts` | `isTrustedPatientPhoneActivation`; перечень writers в `SCENARIOS_AND_CODE_MAP.md` §8 |
| Route & API policy | `apps/webapp/src/modules/platform-access/patientRouteApiPolicy.ts` | Whitelist страниц, API-поверхности, декларативный список onboarding server actions |

Patient-контур для бизнес-операций делегирует в **`patientClientBusinessGate`** → `resolvePlatformAccessContext`. Дублирующие guard-файлы с отдельной бизнес-логикой tier не выявлены в ходе сверки с §7 `SCENARIOS`.

---

## 2. DoD §2 — канон в session и onboarding-only транспорт

- Политика: `sessionCanonicalUserIdPolicy.ts`, `LEGACY_NON_UUID_SESSION_RESOLUTION` в `resolvePlatformAccessContext`.
- Тесты: `exchangeIntegratorToken.uuidSubWithoutBinding.test.ts`, `exchangeIntegratorToken.resolutionHints.test.ts` и др. по exchange; Phase E — `legacy_non_uuid_session` + tier onboarding для `client` в `resolvePlatformAccessContext.test.ts`.

**Вывод:** штатные входы и legacy-транспорт согласованы с SPEC §6 / MASTER §5 C; cookie не «чинит» канон в layout задним числом без обмена.

---

## 3. DoD §3 — onboarding: запрет бизнес-действий на сервере

- REST: `requirePatientApiBusinessAccess` на `/api/patient/*`, `/api/booking/*`, pin set/verify (см. §7 `SCENARIOS`).
- Server actions (напоминания, дневник, …): `requirePatientAccessWithPhone`.
- Профиль / активация: `requirePatientAccess` + **`patientOnboardingServerActionSurfaceOk`** (runtime pathname → `patientServerActionPageAllowsOnboardingOnly`; закрытие **D-SA-1**, см. [`PHASE_E_REAUDIT_REPORT.md`](PHASE_E_REAUDIT_REPORT.md)).

**Негативы (фаза E):** `requireRole.phaseEOnboardingDenial.test.ts` — 403 API + редирект bind-phone для `requirePatientAccessWithPhone` при tier onboarding; `profile/actions.surface.test.ts` — profile actions без pathname профиля не доходят до `requirePatientAccess`; ранее — `requireRole.patientTier.test.ts`, booking 403.

---

## 4. DoD §4 — один access context для patient-зоны

- API/actions/RSC персональных данных: `patientClientBusinessGate` / `patientRscPersonalDataGate` (см. §7 `SCENARIOS`).
- Snapshot телефона в cookie: только UI (`patientSessionSnapshotHasPhone`), не gate для БД по `userId`.

**Вывод:** точечные «только `session.user.phone`» для patient-business вытеснены (фазы C-fix, C.02, D, D-FIX).

---

## 5. Покрытие сценариев `SCENARIOS_AND_CODE_MAP.md` §3–§6 тестами

| Раздел | Сценарий | Как покрыто |
|--------|----------|-------------|
| **§3** Вход мессенджер | hints, `tg:`/`max:` в sub, exchange | `exchangeIntegratorToken.resolutionHints.test.ts`, `exchangeIntegratorToken.maxWhitelist.test.ts`, `exchangeIntegratorToken.messengerRole.test.ts`, `exchangeIntegratorToken.uuidSubWithoutBinding.test.ts` |
| **§3** Tier без доверенного телефона → onboarding | Инвариант tier из БД | `resolvePlatformAccessContext.test.ts` (в т.ч. Phase E: нет телефона / телефон без trust / legacy `tg:`) |
| **§4** OTP / trust | `patient_phone_trust_at` → patient | Phase E: строка с trust → `tier: patient`; без trust при наличии номера → onboarding; `trustedPhonePolicy.test.ts` |
| **§5** OAuth без телефона → onboarding | Email-only канон | Phase E: «OAuth / email-only sign-up row» в `resolvePlatformAccessContext.test.ts`; callback/oauth — `oauth/callback/route.test.ts`, `oauthYandexResolve.test.ts` |
| **§6** Интегратор → БД | События, проекция, не обход web tier | `modules/integrator/events.test.ts` (webapp), интеграторский suite; tier на web не выставляется webhook’ом — архитектурно отделён от §6 |

**D-TST-1 (warmups RSC + onboarding):** закрыт тестом `apps/webapp/src/app/app/patient/sections/[slug]/page.warmupsGate.test.tsx` — при `patientRscPersonalDataGate` → **`guest`** вызов **`listRulesByUser`** не выполняется; при **`allow`** — выполняется (фаза **E — FIX**, 2026-04-11).

---

## 6. DoD §8 — «почему onboarding»

| Сигнал | Где |
|--------|-----|
| **tier, resolution, phone_trusted, has_phone_db, canon id** | `console.info` **`[platform_access]`** в `resolvePlatformAccessContext.ts` (без сырого телефона) |
| **Эквивалент для клиента** | `GET /api/me` → `platformAccess` (`route.ts`) |
| **Первичный резолв канала / merge path** | `[identity_resolution]` в `pgIdentityResolution.ts` |
| **Legacy transport** | `[auth/exchange] client_session_transport=legacy_non_uuid_onboarding_only` (`service.ts`) |
| **Merge** | `[merge] merged duplicate into target` (`pgPlatformUserMerge.ts` и др.) |
| **Layout** | `[patient_layout] need_activation unresolved_pathname` (`layout.tsx`, dev/diagnostic) |
| **Отклонённый onboarding server action** | `[platform_access] onboarding_server_action_rejected resolved_path=…` (`onboardingServerActionSurface.ts`) |

Для кейса «телефон в БД есть, а tier onboarding» по логам **`[platform_access]`** видно `phone_trusted=false` и `has_phone_db=true` при `resolution=resolved_canon`.

---

## 7. Журнал и документация

- [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md) — строки по фазе E (EXEC, AUDIT, FIX, REAUDIT).
- [`PHASE_E_REAUDIT_REPORT.md`](PHASE_E_REAUDIT_REPORT.md) — повторный аудит и закрытие **D-SA-1**.
- [`SCENARIOS_AND_CODE_MAP.md`](SCENARIOS_AND_CODE_MAP.md) §9, §10, §11 — синхронизированы с закрытием §8 и чек-листа E.
- [`MASTER_PLAN.md`](MASTER_PLAN.md) §9 — статус DoD §1–§4 и §8 после аудита.

---

## 8. Резюме

| DoD | Закрытие |
|-----|----------|
| §1 | Да |
| §2 | Да (с фазами B, C) |
| §3 | Да (**D-SA-1** закрыт в E-REAUDIT — `patientOnboardingServerActionSurfaceOk`) |
| §4 | Да (с C.02, D, D-FIX) |
| §8 | Да (`[platform_access]` + агрегат существующих логов + `/api/me`) |
