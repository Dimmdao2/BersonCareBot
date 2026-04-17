# Platform Identity & Access — независимый глубокий аудит (2026-04-11)

Метод: по плану этапов 0–7; нормативка — [`SPECIFICATION.md`](SPECIFICATION.md), цели — DoD в [`MASTER_PLAN.md`](MASTER_PLAN.md) §3; карта кода сверялась с [`SCENARIOS_AND_CODE_MAP.md`](SCENARIOS_AND_CODE_MAP.md). Статусы «закрыто» в доках трактовались как гипотезы, проверенные grep и чтением исходников.

**CI:** `pnpm install --frozen-lockfile && pnpm run ci` — успешно на момент отчёта.

---

## Сводка по этапам

| Этап | Фокус | Итог |
|------|--------|------|
| 0 | Инвентаризация путей | Якорные файлы из SCENARIOS присутствуют в репозитории; журнал и прошлые отчёты учтены как контекст, не как доказательство. |
| 1 | Tier / trusted phone | Единая read-side точка `isTrustedPatientPhoneActivation`; резолв контекста — `resolvePlatformAccessContext`; якоря writers — enum + `trustedPatientPhoneWriteAnchor`. |
| 2 | Канал ↔ канон / integrator | `findOrCreateByChannelBinding`: binding → hints (UUID / integrator id / телефон только `findTrustedCanonicalUserIdByPhone`) → merge → INSERT; `events/route.ts` — `resolveCanonicalPlatformUserId` для diary; `collectCandidateIds` в `pgUserProjection.ts` шире messenger-hints — задокументировано в коде (signed webhook). |
| 3 | Session / TOCTOU | `sessionCanonicalUserIdPolicy.ts` + `legacy_non_uuid_session`; при ошибке БД `patientClientBusinessGate` откатывается на `session.user.phone` — см. P2 ниже. |
| 4 | Booking / patient API | Все `route.ts` под `app/api/booking/*` и `app/api/patient/*` используют `requirePatientApiBusinessAccess`; `api/auth/pin/set`, `pin/verify` — тоже. |
| 5 | RSC / layout / server actions | Персональные RSC (кабинет, дневник, уведомления, главная, purchases, warmups) — `patientRscPersonalDataGate`; onboarding profile — `requirePatientAccess` + `patientOnboardingServerActionSurfaceOk`; публичный контент `content/[slug]` без userId в БД — осознанно. |
| 6 | Тесты / логи / конфиг | Тесты фазы E и D-TST-1 на месте; `[platform_access]` без сырого телефона в `resolvePlatformAccessContext.ts`; интеграционный конфиг в рамках этого прохода не расширялся (правило репо — `system_settings`). |
| 7 | GLOBAL / DoD | Матрица §1–§8 — см. раздел ниже. |

---

## Находки по приоритету

### P0

Не выявлено: нет обнаруженных обходов patient-business gate на проверенных поверхностях API/RSC, нет неконтролируемого «patient» только из `phone_normalized` без `patient_phone_trust_at` на read-path приложения.

### P1

Не выявлено в коде приложения относительно заявленного DoD. (Повторный аудит не заменяет пентест и не покрывает все внешние интеграторские API под `/api/integrator/*` — там отдельная модель доверия подписи.)

### P2 (остаточные риски / эксплуатация)

| ID | Тема | Суть |
|----|------|------|
| P2-DB-FALLBACK | Деградация при ошибке БД | [`patientClientBusinessGate.ts`](../../apps/webapp/src/modules/platform-access/patientClientBusinessGate.ts): при `DATABASE_URL` задан, но `resolvePlatformAccessContext` бросает, gate возвращает `allow`, если в сессии есть `user.phone`. Это осознанный fallback (см. журнал фазы C), но при частичном сбое БД теоретически расходится с «tier только из БД». Риск эксплуатации низкий (нужна недоступность БД + валидная сессия). |
| P2-OPS-SCRIPTS | Скрипты и SQL вне приложения | `apps/webapp/scripts/` (`backfill-*.mjs`, `backfill-rubitime-history-to-patient-bookings.ts`, `repair-client-*.sql` и т.д.) могут писать `platform_users` / `phone_normalized` без выравнивания с `TrustedPatientPhoneSource` и `patient_phone_trust_at`. Уже отражено в SCENARIOS §8 как не-trusted по умолчанию; для продакшена — только осознанный runbook. |
| P2-PROFILE-RSC | Профиль и персональные данные в onboarding | [`profile/page.tsx`](../../apps/webapp/src/app/app/patient/profile/page.tsx) читает БД по `userId` при `requirePatientAccess` (не `WithPhone`). Соответствует whitelist активации; утечки «чужих» данных нет — только канон текущей сессии. |

---

## Матрица DoD ([`MASTER_PLAN.md`](MASTER_PLAN.md) §3)

| DoD | Статус | Доказательства в коде |
|-----|--------|------------------------|
| §1 Три модуля | Соответствует | `resolvePlatformAccessContext` + `trustedPhonePolicy` + `patientRouteApiPolicy` / `patientClientBusinessGate` в `modules/platform-access/` |
| §2 Канон в session | Соответствует | `sessionCanonicalUserIdPolicy.ts`, exchange-потоки в `modules/auth/service.ts` (см. SCENARIOS §2) |
| §3 Onboarding без бизнеса | Соответствует | `requirePatientApiBusinessAccess`, `patientOnboardingServerActionSurface.ts` + `profile/actions.ts` |
| §4 Patient-зона один контекст | Соответствует | Gates опираются на `patientClientBusinessGate` → `resolvePlatformAccessContext` |
| §5 Multi-channel | Соответствует | `pgIdentityResolution.ts`, телефон в hints только через trusted canon |
| §6 Integrator | Соответствует | События пишут БД; tier на web не вычисляется в integrator — только в webapp |
| §7 Doctor/admin | Не регресс (по коду) | `tier: null` для не-client в `resolvePlatformAccessContext` |
| §8 Наблюдаемость | Соответствует | `[platform_access]`, `[identity_resolution]`, отклонённые onboarding actions |

---

## Чек-лист GLOBAL_AUDIT ([`PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md`](PROMPTS_EXEC_AUDIT_FIX_GLOBAL.md))

1. Три централизованных модуля — **да**.  
2. Tier guest/onboarding/patient для `client` — **да**; doctor/admin отделены — **да**.  
3. Cookie / канон / legacy — **да** (политика зафиксирована).  
4. Onboarding на сервере — **да** (API + runtime pathname для profile actions).  
5. Patient API/RSC — **да** (проверена выборка handlers и RSC с `buildAppDeps` по userId).  
6. Multi-channel / `findOrCreateByChannelBinding` — **да**.  
7. Integrator / проекции — **да** (канон для diary, upsert paths).  
8. Логи без сырого телефона в tier-логе — **да** для `[platform_access]`; прочие пути не выявили очевидных утечек E.164 в `console` внутри `platform-access`.  
9. Конфиг интеграций не в env — **в рамках диффа инициативы** новых env под ключи не добавлялось; полный аудит всех `process.env` вне скоупа.

---

## Вердикт

**Инициатива Platform Identity & Access по коду в объёме DoD §1–§8 и проверенных поверхностей считается закрытой.** Остатки **P2** — эксплуатационные (скрипты, fallback при падении БД), не блокирующие закрытие, при условии дисциплины runbook и мониторинга доступности БД.

Предыдущие отчёты ([`PHASE_D_DEEP_AUDIT_REPORT.md`](PHASE_D_DEEP_AUDIT_REPORT.md), [`PHASE_E_AUDIT_REPORT.md`](PHASE_E_AUDIT_REPORT.md), [`PHASE_E_REAUDIT_REPORT.md`](PHASE_E_REAUDIT_REPORT.md)) остаются полезными приложениями; этот документ — независимая сквозная сверка без дублирования построчного разбора каждого файла.

---

## Дополнение (2026-04-14)

После публикации этого отчёта выполнено **операционное усиление** без пересмотра вердикта выше: страница `/max-debug` управляется только флагом **`max_debug_page_enabled`** в `system_settings` (admin), не через env; успешные логи `POST /api/auth/max-init` не содержат сырых идентификаторов пользователя/канала; обновлён копирайт главного меню в шаблонах Telegram/MAX. Детали, файлы и коммит: строка **2026-04-14** в [`AGENT_EXECUTION_LOG.md`](AGENT_EXECUTION_LOG.md), коммит `b10f887`.
