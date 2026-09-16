# Ночной автономный прогон 2026-07-23 — отчёт для серверного агента

**Кто:** web-агент (Opus) + его суб-агенты. **Ветка:** `feat/doctor-ip-rebuild` → `feat/doctor-ui-rebuild`,
кончик `7dba6838` (34 коммита за сессию, от `cfece2a4`). **Всё запушено, дерево чистое.**

## 0. С ЧЕГО НАЧАТЬ ЗАВТРА (entry points)

1. `docs/CURRENT_AUTHORITY_MAP.md` — где актуальный источник по каждой области (карта, doctor UI, SaaS, backend).
2. `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/PRODUCTION_READINESS_LEDGER_2026-07-23.md` — §4 (backend-first остаток),
   §8 (результаты перепроверки всех `[x]`).
3. `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/START_HERE_ORCHESTRATOR_KICKOFF.md` — запуск оркестратора.
4. Карта клиента: `docs/design/bersoncare-карточка-пациента-CURRENT-SPEC.md`.

## 1. Здоровье ветки (проверено)

- Полный `pnpm run typecheck` (4 воркспейса) — **exit 0**.
- `pnpm run lint` (eslint + все check-скрипты) — **exit 0**.
- `pnpm audit --audit-level=high` — **0 high** (Next 16.2.11 + find-my-way override).
- ⚠️ Пред-существующий (НЕ мой) фейл: `PatientTabRecords.memberships.test.tsx` — падает и на чистом дереве
  (TZ/fixture-зависимый). Не трогал; кандидат на отдельный фикс.

## 2. Что сделано — КОД

- **Карта клиента (по твоему спеку):**
  - Удалена агентская правая полоска-превью; клик по строке → полная карта (`561f9d89`, typecheck+тест ok).
  - Шапка почищена: убраны пол/рост/вес/chips Архив-Заблок/правая мини-сводка/возраст; **звезда «На сопровождении»
    и portal invite ОСТАВЛЕНЫ** (твоя правка); отступ карандаша поправлен (`e8b6ad4f`, typecheck 0, тесты 21/21).
  - Тикнуты UI-5b боксы 532/533 с evidence.
- **Security/зависимости:**
  - Next `16.2.6 → 16.2.11` (SSRF+advisories, build ok) (`bc41c566`); `find-my-way ≥9.7.0` override (DDoS/HTTP2,
    typecheck+build integrator ok) (`d60cb122`) → 0 high CVE.
  - SEC-01 security-стек в CI: Gitleaks(+baseline)/Semgrep(+.semgrepignore)/Trivy/реальный CVE-скан (`2027f969`),
    gitleaks negative-self-test (`5fe487e2`), pre-release full Trivy + guarded ZAP workflow (`7dba6838`).
- **CI-гейты:** c3 fanout-inventory (`a800d8d1`), 4 дрейфнувших tenant-org гейта fail→pass с сохранением teeth (`395c741b`).
- **Backend:** mark-read 500 фикс — грант `UPDATE(read_at)` + тест (`ca69e348`, ⚠️ нужно применить миграцию на TEST);
  Track D **D1-скаффолд** прямой записи integrator→public + 6 unit-тестов, НЕ вкручен (`c6e2d2bb`, ⚠️ вкрутить+сверить на БД).

## 3. Что сделано — ПЛАНЫ/ДОКИ (борьба с хаосом)

- **Полная перепроверка всех `[x]`** (~676) по коду в 7 кластерах + adversarial-аудит: 659 подтверждено, **6 fake-done
  снято** (2× Rubitime «create без Rubitime» #839; 1× TASK_A PII rehearsal; 3× протухшая SHA в Doctor-UI), 11 → `[~]`.
  Коммиты `1c2625fd`,`1242738f`,`e9a47687`,`52a00da8`,`375c99b8`,`ea141590`,`6c5a0b6a`,`89e7c9b9`,`54ad7278`,`78930ba6`.
- **Единый источник:** `PRODUCTION_READINESS_LEDGER_2026-07-23.md` (`a447eac1`), `CURRENT_AUTHORITY_MAP.md` (`57edbfc8`),
  карта клиента CURRENT-SPEC (`7283a925`,`3102ba1e`).
- **Supersession-гигиена (двусторонние ссылки, частичная замена не теряет контент):** форвард-ссылки на устаревших
  планах — UI/architecture (`b4bc310a`), APP_RESTRUCTURE (`632958f9`), SAAS_FOUNDATION (`b664c056`), backend digest;
  бэклог карты — частичная supersession с сохранением клин.модели §2/3/5/6 (`12bd1bce`).
- **Правила на будущее** (чтобы хаос не повторился): «код важнее прозы» + supersession-гигиена + двусторонние ссылки —
  в `docs/ORCHESTRATION_BINDINGS.md` (`cfece2a4`, `b4bc310a`).

## 4. Что ОСТАЛОСЬ на сервер (по открытым чек-листам; без визуальной приёмки владельца и юр-гейтов)

Полный список — LEDGER §4. Кратко:

- **Мелкое:** применить mark-read миграцию на TEST + прогон; диагностика isolation CRITICAL `role_pool_mismatch`.
- **Среднее:** PII Task A (2 таблицы org-колонка+backfill+стемпинг); Track C drain (RR-PROOF-09) + убрать
  `branchServiceId` (R3C-11, ~51 файл); FORCE-RLS cutover на TEST (runbook готов); delivery-alerting P0/P-guard
  (fault-injection на TEST).
- **Крупное (единственный большой новый код):** Track D D1→D10 (прямые записи; D1-скаффолд готов); Track C R7
  (архив+DROP rubitime-таблиц, owner-gate).
- **Живой прогон:** первый Semgrep/Trivy triage (SEC-01 line 44); backup DR-drill (нужен owner age-ключ).

## 5. Карта клиента — что осталось (код + твоя визуалка)

Сделано: правая полоска убрана, шапка почищена, состав **4 вкладки** зафиксирован в CURRENT-SPEC
(`Карточка·Программа·Файлы·Учётка`, старт на «Карточке»). **Осталось (UI-5b body, BLOCKED `#971→#796`, под твою
визуальную приёмку):** слить Обзор/Коммуникации/Записи/Финансы в тело «Карточки» (KPI-строка, заметки/задачи/динамика/
программа/абонементы) — по CURRENT-SPEC §3 + модель содержимого в бэклоге §2/3/5/6.

## 6. Security — что в CI теперь и что тебе донастроить

В CI: Gitleaks(full-history+self-test), Semgrep, Trivy(fs+pre-release full), реальный CVE-скан. ZAP-workflow заведён,
но **OFF by default** — чтобы включить: выставить repo-vars `ZAP_ENABLED`/`ZAP_TEST_TARGET` (+ `ZAP_PROD_BASELINE_APPROVED`
/`ZAP_PROD_TARGET`), заполнить два `TODO(owner)` firewall OPEN/CLOSE в `zap.yml` + секреты `ZAP_FW_*`, провести
threat-review. Находки — триаж владельцу, не авто-фикс.
Отдельно: security-аудит `LOW_LEVEL_ARCHITECTURE_AUDIT_AND_REORG.md` §1 (phone-auth доверял channel из body) — **уже
закрыт** в коде (`confirm/route.ts` берёт channel только из challenge); аудит-док на этот пункт устарел.

**Security-review проведён** (`SECURITY_REVIEW_2026-07-23.md`, `83275e01`): **0 эксплуатируемых Critical/High**, 9
пунктов verified-OK, 3 в триаж. По твоей просьбе добит безопасный фикс — **глобальные security-заголовки** (nosniff,
Referrer-Policy, HSTS, `frame-ancestors 'self'` на `/app/*`; `/book` оставлен встраиваемым), build ok (`0dc8951d`).
**Осталось владельцу:** полный CSP (`default-src`), SVG-upload allowlist, CSRF-matcher scope — см. отчёт.

---

_Отчёт durable; линк из `docs/CURRENT_AUTHORITY_MAP.md`. Оперативная очередь — taskdb `project=bcb`._
