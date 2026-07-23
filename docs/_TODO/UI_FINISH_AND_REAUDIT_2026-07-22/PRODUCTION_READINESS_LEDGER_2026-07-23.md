# PRODUCTION READINESS LEDGER — verified 2026-07-23

Единый источник для планирования продовой подготовки. Сведено из трёх code-reconciliations 2026-07-23 (главный
roadmap + SAAS_FOUNDATION + сквозные prod-планы) поверх семи code-аудитов ранее в этот день. Статусы проверены по
коду/миграциям/CI/тестам, а не по галочкам в планах.

> **Галочки в планах врут в обе стороны** и не являются источником истины: chokepoint помечен «завершён», но его
> 8 боксов стояли открытыми; SECURITY_CI показывал 0/20, хотя сканеры уже залиты. Поэтому здесь — code-verified
> классификация. По итогам этой сессии сами планы приведены в соответствие (см. §5).

## 1. Классы статуса (как читать)

- **ACCEPTED** — сделано и независимо принято/доказано.
- **CODE-DONE → DORMANT/UNTICKED** — код есть и протестирован, но либо ждёт owner-триггера cutover, либо галка
  просто не проставлена. **Не требует написания кода.**
- **REMAINING-BACKEND** — реальную работу кодом ещё надо сделать.
- **OWNER/LEGAL-GATED** — заблокировано решением владельца или юр/хостинг-действием, не инженерной ёмкостью.
- **FRONTEND-OWNER-ACCEPTS** — код в разумной форме, нужен живой клик-through владельца (вне backend-скоупа).

## 2. Главный roadmap — 19 U-контрактов (`SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`)

| Итог | Стадии |
|------|--------|
| **ACCEPTED (4)** | U0 контракт-готовность, U1 capability-guard, U2 mgmt+account shell, U3S спец. signup/first-run |
| **OWNER-GATED live-seal (1)** | U5A patient org-resolver (код в осн. есть; 2 live-seal + `#796` ждут решения по discharge-flow) |
| **Законно отложено на будущее (6)** | U3A, U5C, U5D, U8A, U8B, U8C (post-launch/optional — НЕ долг) |
| **REMAINING launch (8)** | U3B (~50%), U4 (0%), U5B (0, блок на U5A), U6A (фронт, частично), U6B (0, блок на U4), U7 (0), U9 (0 сверх U9A-спайна), U10 (0, финал) |

**Самый острый разрыв «roadmap done ≠ чек-лист»:** **U3B 5/10** — нет SMS-lifecycle, продолжения
public-booking→enrollment, PWA install/push, полного аудита. Крупнейшая launch-критичная backend-дыра. Ещё: **U5A**
стоит `[x] audit PASS` при 2 открытых live-seal. Худшие фейк-done (`#963`, `#931` Tiptap, C5A×4) roadmap уже
демотнул сам.

## 3. Backend-треки — code-verified

| Трек | Статус | Комментарий |
|------|--------|-------------|
| Tenant isolation / RLS | **CODE-DONE → DORMANT** | Дескрипторы/рендерер/политики (~102+ таблиц), role-split, гранты, FORCE-скрипт. Дефолт `legacy-guc`. Живой флип на TEST делали 2026-07-13 (стены доказаны, откат в dormant). Ждёт owner-cutover. |
| Тарифы / entitlements / trial | **CODE-DONE (C5A accepted)** | Реестр 15 механик, resolver, admin API, guard в ~40 роутах. |
| Платежи-эквайринг (пациент) | **CODE-DONE, нужны per-org креды** | 5 провайдеров + webhooks + тесты; дефолт mock. |
| SaaS-биллинг / магазин (C5B/C/D) | **REMAINING + owner/legal** | Провайдер-нейтрально; реальная активация YooKassa — owner+legal (merchant/receipt/law). |
| Security-CI (SEC-01) | **CODE-DONE (8 из 20)** | Gitleaks/Semgrep/Trivy/CVE залиты (`2027f969`). Остаток: первый triage/baseline, negative-test, ZAP-стек. |
| DB-access chokepoint | **ACCEPTED (8/8)** | `check-db-chokepoint.mjs` в lint; S6 2026-07-04 + re-audit 07-07. |
| Stability hardening | **Phase 0-2 в осн. done; 28 REMAINING** | D1 session-revoke (ждёт TTL-решения), E3 Zod SSOT `#980`, A4 RLS-cutover, A2 матрица, E1 lint-boundary, C3/F2/F3 post-launch. |
| RU-privacy / 152-ФЗ | **~112 REMAINING-backend, ~165 OWNER/LEGAL** | DR-drill, LOG-01, CRYPTO-01 C0, NTF-01 census, SEC-02/03 — можно делать. Consent/DSAR/ISPDn/host-cutover/FINAL_ACCEPTANCE — юр/владелец. |
| Backups | **CODE-DONE (скрипт), DR-drill не запускался** | `postgres-backup.sh` готов; реальный age-ключ + restore (DR-01/02) НИКОГДА не прогонялись. |
| Delivery-alerting | **P1-P4 done; P0/P-guard OWNER-GATED** | Нужна авторизация живой fault-injection на TEST. |
| Track C — Rubitime retire | **R1-R2 done; R3-R6 code-only; R7 не начат** | `branchServiceId` жив; DROP-миграции нет; всё разрушающее owner-gated. |
| Track D — direct→public | **D0 done; D1-D10 не начаты** | D1-скаффолд подготовлен (`c6e2d2bb`), не вкручен. |
| Editor Tiptap | **CODE-DONE; 1 OWNER-accept** | Вся инженерия закрыта, нужен клик владельца. |
| mark-read 500 | **FIXED (нужна DB-верификация)** | `ca69e348`, применить на TEST. |

## 4. Реальный объём остатка (то, что надо ПИСАТЬ кодом) — по приоритету

Backend, не зависит от фронта. Owner/legal-гейты вынесены в §6.

1. **U3B добивка** (launch-критично): SMS-lifecycle, public-booking→enrollment continuation, PWA install/push, полный аудит.
2. **Track D D1→D10** — прямые транзакционные записи integrator→`public` (D1-скаффолд готов, вкрутить+сверить схему на БД).
3. **SEC-01 остаток**: первый Semgrep/Trivy triage + baseline, gitleaks negative-test, ZAP-стек (кроме prod-baseline).
4. **Stability**: A4 RLS fail-closed cutover (снять ~87 ручных `org_id … OR IS NULL`), A2 cross-tenant матрица, E3 Zod SSOT `#980`, E1 lint-boundary. D1 session-revoke — как только владелец даст TTL.
5. **RU-privacy agent-doable**: DR-01/02 реальный restore-drill (нужен age-ключ от владельца), LOG-01 L0/L2 payload-hygiene, CRYPTO-01 C0 ADR-черновик, NTF-01 census+egress-guard, SEC-02/03 repo-слайсы.
6. **SAAS_FOUNDATION остаток build** (малый, конкретный): PII Task A (`platform_user_contacts`+`user_phone_history` — org-колонка+backfill+стемпинг), P0.7.2 webapp-writer sweep, value-level гранты на `be_appointments`.
7. **Track C drain/cutoff**: RR-PROOF-09 (остановить обмен, drain outbox), убрать `branchServiceId` (R3C-11, ~51 файл), затем подготовить R7-DROP.
8. **U4 → U6B → U7 → U9 → U10** и **C6 analytics / C7 TEST-candidate** — крупные launch-стадии, 0%.

## 5. Что приведено в соответствие в этой сессии

- SAAS_FOUNDATION чек-листы: проставлены done-but-unticked с инлайн-evidence, cutover-шаги → `[~]`, реальные дыры → `REMAINING` (apply-проход).
- SECURITY_CI: 8 залитых пунктов тикнуты с evidence (`2027f969`); остаток размечен REMAINING/gated.
- DB-chokepoint: 8/8 тикнуты с evidence (check-script + FUNNEL_COVERAGE_REPORT).
- STABILITY / RU-privacy / OUTBOUND / EDITOR: verified STATUS-заголовки со сплитом (без тика гейтов).
- Каждый изменённый план несёт строку `> STATUS (verified 2026-07-23…)` со ссылкой на checkpoint.

## 6. Главный рычаг — решения и приёмка владельца (не код)

Большой пласт готового кода лежит дормантом и ждёт ТЕБЯ, а не инженеров:

1. **SMTP-креды для TEST** → вход владельца → приёмка всего UI.
2. **FORCE-RLS cutover на TEST** (после PII Task A) — включить `locked`, прогнать 2-org smoke по готовому runbook.
3. **age-ключ + разрешение на DR-drill** (backup restore).
4. **Session TTL** (D1, рекоменд. 7 дней) — разблокирует session-revocation.
5. **Rubitime R7 DROP на TEST** — после drain-proof.
6. **Платный биллинг в первом прод-скоупе?** (да/нет) — определяет, входят ли C5B/C/D + магазин.
7. **RU-privacy юр-гейты** — consent/DSAR/ISPDn/GO-NO-GO (внешний юрист).
8. **Приёмочные клик-through сессии** по фронту (U6A, Doctor-UI residuals, Tiptap) и по evidence-real backend.

---

_Первоисточники: `IMPLEMENTATION_ROADMAP.md` (§7.3, §8, §9.1), `SAAS_FOUNDATION/*CHECKLIST*`, `SECURITY_CI_STACK_PLAN.md`,
`STABILITY_SECURITY_HARDENING_PLAN_2026-07-21.md`, `RU_PRIVACY_AND_PRODUCTION_READINESS/`, `DB_ACCESS_CHOKEPOINT_INITIATIVE/`,
`OUTBOUND_DELIVERY_ALERTING_PLAN.md`, `EDITOR_TIPTAP_MIGRATION_PLAN.md` и код, процитированный в реконсиляциях._
