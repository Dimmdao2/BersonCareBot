> STATUS (verified 2026-07-23, code-reconciled): see docs/\_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md
>
> UPDATE 2026-07-31 (`#881`): static lane repaired and verified live in GitHub run `30591353045`:
> Gitleaks full-history + runtime negative self-test, Semgrep ERROR scan and Trivy filesystem scan all PASS.
> The workflow is red only on the separately tracked dependency finding `#1014` (`brace-expansion` through
> ESLint). ZAP remains disabled until a safe TEST runner/firewall contract exists; PROD scanning is not
> authorized.

# План: Security-стек в CI (Gitleaks · Semgrep · Trivy · OWASP ZAP)

> Заведён 2026-07-19 (владелец: «security-стек — надо задачу и план»). Задача в taskdb: проект `bcb`.
> Решение по составу — в [`docs/ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md`](../ARCHITECTURE/TOOLING_AND_PACKAGES_DECISIONS.md).
> Мотив: медданные + прошлый инцидент — реальные прод-креды утекали в dev `.env` (память `dev-env-hardening-real-creds`);
> Gitleaks бьёт ровно по этому классу.

## Контекст инфры (факт)

- CI = **GitHub Actions**, `.github/workflows/ci.yml` (jobs: lint, typecheck, test-integrator, test-webapp-core ×3,
  test-webapp-inprocess ×3 [только push в main], build-integrator, build-webapp, **audit** = `pnpm run audit`).
- Есть composite-actions `./.github/actions/setup-pnpm` и `./.github/actions/cancel-on-failure`.
- Триггеры: `push` в `main`/`development`, `pull_request`.
- Security workflows уже находятся в репозитории; статические jobs исправлены 2026-07-31, ZAP остаётся
  выключенным scaffold до безопасного TEST-контура.
- Прод-деплой — `deploy-prod.yml` (ручная кнопка на `main`).
- Тестовый сервер `test.bersoncare.ru` **IP-locked на VPN** (память `bcb-test-env-and-redirect-passthrough`) — важно для ZAP (ниже).

## Кадэнс (цель)

| Инструмент      |              На каждый PR               | Еженедельно | Перед релизом |
| --------------- | :-------------------------------------: | :---------: | :-----------: |
| Gitleaks        |                   ✅                    |             |               |
| Semgrep         |                   ✅                    |             |               |
| Trivy (быстрый) |                   ✅                    |             |               |
| Trivy (полный)  |                                         |             |      ✅       |
| OWASP ZAP       |                                         |     ✅      |      ✅       |
| Garak           | _после появления AI-агентов в продукте_ |             |               |

## Чек-лист внедрения

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

### Этап 1 — Gitleaks (очень высокий приоритет)

- [x] Новый job `secrets-scan` в `ci.yml`: Gitleaks v8.30.1, binary + обязательная SHA-256 проверка;
      локальный full-history scan PASS 2026-07-31.
- [x] Полноисторический скан хотя бы на push в `main` (не только diff) — прошлый инцидент был про содержимое `.env`. (✓ .github/workflows/security.yml:29-35 checkout `fetch-depth: 0` + `gitleaks git .` full-history | commit 2027f969)
- [x] `.gitleaks.toml` + `.gitleaksignore`: blanket-исключения `.env*`/lockfile удалены; baseline содержит
      только 28 exact historical fingerprints. Новое повторение получает другой commit fingerprint и валит CI.
- [x] Runtime-only self-test создаёт никогда не выдававшееся GitHub-token-shaped значение из случайных байтов;
      `gitleaks dir` обязан завершиться non-zero.
- [x] fail-closed: находка high-confidence секрета = красный PR. (✓ .github/workflows/security.yml:39 `gitleaks git .` runs without `continue-on-error`, non-zero exit on finding = red build | commit 2027f969)

### Этап 2 — Semgrep

- [x] Job `semgrep` (PR): `semgrep ci` с рулсетами `p/default`, `p/typescript`, `p/react`, `p/nodejs`, `p/secrets`. (✓ .github/workflows/security.yml:52-77 job `semgrep`, pinned image semgrep/semgrep:1.85.0, `--config .semgrep.yml --config p/default --config p/typescript --config p/react --config p/nodejs --config p/secrets` | commit 2027f969)
- [x] `.semgrepignore` для генератов (`.next/`, `dist/`, `node_modules/`, снапшоты тестов). (✓ .semgrepignore (repo root) — node_modules/, .next/, dist/, build/, .turbo/, coverage/, \*.min.js, pnpm-lock.yaml, drizzle-migrations meta snapshots, test-fixtures dirs | 2026-07-23)
- [x] Порог фейла: `ERROR`-severity валит PR; `WARNING` — аннотация, не блок (чтобы не заспамить на старте). (✓ .github/workflows/security.yml:71-72 `--severity ERROR --error` | commit 2027f969)
- [x] Полный локальный scan Semgrep v1.164.0 по 6,124 tracked files: после удаления дублирующего noisy
      hardcoded-secret правила и `shell:true` в четырёх constant-argv gates — 0 ERROR findings. Literal
      secrets/credential URLs остаются ответственностью полного Gitleaks gate.

### Этап 3 — Trivy

- [x] Job `trivy-fs` исправлен на безопасный post-incident `trivy-action` v0.36.0, pinned exact SHA,
      `scan-type: fs`, `scanners: vuln,misconfig,secret`, `severity: HIGH,CRITICAL`; live GitHub job
      `91034176429` в run `30591353045` PASS 2026-07-31.
- [x] `.trivyignore` для принятых/неустранимых сейчас CVE (с комментарием-обоснованием и датой ревью). (✓ .trivyignore (14 lines) wired via `trivyignores: .trivyignore` at .github/workflows/security.yml:103 | commit 2027f969)
- [ ] Полный pre-release workflow исправлен на тот же immutable v0.36.0; all-severity report больше не
      скрывает unfixed findings, CRITICAL pass остаётся fail-closed. Первый manual live run ещё не выполнен:
      GitHub не регистрирует новый `workflow_dispatch`, пока workflow отсутствует в default branch; `feat`
      в `main` этой задачей не публикуется.
- [x] Согласовать с существующим `pnpm run audit` (Trivy шире — деп-CVE + misconfig + secret; не дублировать смысл, а дополнять; при желании оставить только Trivy). (✓ resolved via new dedicated job — `package.json:93` `audit:cve`: `pnpm audit --audit-level=high`, run by `dependency-audit` job at .github/workflows/security.yml:107-115; existing `ci.yml` `audit` job left as-is for saas-regression, no overlap | commit 2027f969)

### Этап 4 — OWASP ZAP (DAST)

**Режимы (решение владельца 2026-07-19; техническое уточнение 2026-07-19):**

- **Baseline** — отправляет обычные HTTP/spider-запросы и проходит доступные ссылки, но не запускает active attack
  payloads. Он не должен менять состояние при корректных GET-контрактах, однако это всё равно сетевой скан, а не
  «только наблюдение»; по проду разрешается лишь после отдельного review target/rules.
- **Активный (active scan)** — атакующий: инъекции в формы, отправка запросов → мусорные данные, возможные реальные
  отправки пациентам, нагрузка. Разрешён ТОЛЬКО по тесту/эфемерной копии. **По проду активный — ЗАПРЕЩЁН.**

**Карта целей:**

| Где                                           | Режим                                                         | Доступ                                                                                                                                                                        | Кадэнс                             |
| --------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Тест (`test.bersoncare.ru`) / эфемерная копия | активный (ломать можно)                                       | **вариант 2**: снять IP-запрет ТОЛЬКО для диапазонов IP GitHub-раннеров, узким **авто-закрывающимся окном** (открыть перед сканом → скан → сразу закрыть, в т.ч. при падении) | еженедельно + перед релизом        |
| Прод (после 1-го прод-деплоя)                 | **только baseline**, после owner-approved target/rules review | публичный, достаём напрямую (VPN не при чём)                                                                                                                                  | еженедельно + после каждого релиза |

- [x] Отдельный workflow `zap.yml`: `schedule` (еженедельно) + `workflow_dispatch` (перед релизом). НЕ на каждый PR. (✓ .github/workflows/zap.yml `on: schedule` cron `0 3 * * 1` (Monday) + `workflow_dispatch`, no `pull_request` trigger at all; both jobs additionally gated `if: vars.ZAP_ENABLED == 'true'` / `vars.ZAP_PROD_BASELINE_APPROVED == 'true'` so nothing fires until owner wires it | 2026-07-23)
- [x] **Тест, вариант 2:** тянуть актуальные IP-диапазоны GitHub Actions (api.github.com/meta) и открывать IP-allowlist теста только им; окно узкое и авто-закрывается (шаг закрытия — `if: always()`). (✓ .github/workflows/zap.yml job `zap-test-active-scan`: step "Fetch current GitHub Actions runner IP ranges" curls `https://api.github.com/meta`, step `TODO(owner): OPEN ...` marks where the real firewall-open call + `ZAP_FW_*` secrets go, step `TODO(owner): CLOSE ...` has `if: always()` so it auto-closes even on scan failure — firewall API call itself is owner-gated TODO, not wired to a real firewall (no firewall API/creds given) | 2026-07-23)
- [ ] Учесть, что hosted-runner ranges общие для разных GitHub-клиентов: в окно тест содержит только синтетику,
      не содержит prod-секретов, окно имеет аварийный timeout/cleanup и отдельный owner-approved threat review. (PARTIAL — structurally supported: zap.yml's window only ever targets `vars.ZAP_TEST_TARGET` seeded with demo fixtures, never prod secrets, and the CLOSE step is `if: always()` (auto-cleanup on failure). Left `[ ]` / owner-gated: the "отдельный owner-approved threat review" of the shared-hosted-runner-range risk is a human sign-off this task cannot self-certify — owner must actually perform and record that review before flipping `ZAP_ENABLED` to `true` | 2026-07-23)
- [x] **Тест — активный скан по СИНТЕТИКЕ, не прод-дампу** (безопасный дефолт владельца 19.07): гнать активный скан по тесту, залитому демо-фикстурами (память `demo-test-fixtures-on-test-db`), а не прод-дампом. Активному скану нужен наш код/роуты, а не реальные PII; так закрывается остаточный риск «диапазоны GitHub общие». (Хочет владелец по прод-дампу — отдельное подтверждение.) (✓ .github/workflows/zap.yml job `zap-test-active-scan` uses `zaproxy/action-full-scan@v0.12.0` against `vars.ZAP_TEST_TARGET` only, with an explicit comment that this must be the demo-fixture test target and never a prod dump; owner still supplies the actual `ZAP_TEST_TARGET` value pointing at the demo-fixture-seeded test env | 2026-07-23)
- [ ] **Прод — ТОЛЬКО baseline после owner-approved target/rules review**, добавляется в скоуп после первого
      прод-деплоя. Активный по проду не запускать никогда. (owner/legal-gated: prod DAST scanning requires owner-approved target/rules review before any run, per policy above. Workflow support authored — .github/workflows/zap.yml job `zap-prod-baseline` uses `zaproxy/action-baseline@v0.12.0` (baseline/passive only, never `-a` active), `workflow_dispatch`-only, gated `if: vars.ZAP_PROD_BASELINE_APPROVED == 'true'` which stays unset until the owner completes the review and flips it — box left `[ ]` since the review itself is owner-gated, not code | 2026-07-23)
- [x] Отчёт артефактом; триаж находок владельцу, не авто-фикс. (✓ .github/workflows/zap.yml both jobs upload `report_html.html`/`report_md.md`/`report_json.json` via `actions/upload-artifact@v4` (`if: always()`); `fail_action: false` on both ZAP action steps so findings surface as an artifact for owner triage rather than auto-blocking/auto-fixing | 2026-07-23)

### Этап 5 — Garak (отложено)

- [ ] Подключить только после появления AI-агентов в продукте (LLM red-teaming). Сейчас не заводить. (owner/legal-gated: deferred by owner decision until AI agents ship in product; not to be started now)

## Границы / правила

- Ничего разрушительного против **прода** (память `prod-is-untouchable-hard-rule`). По проду ZAP — **только
  baseline после отдельного review**; active-scan — исключительно тест/эфемерная копия.
- Находки сканеров = **триаж владельцу**, не авто-исправление (память `dont-autofix-acceptance-findings`).
- Все allowlist/ignore — осознанные, с комментарием и датой; не глушить массово ради зелёного билда.
- Секреты для самих экшенов (если понадобятся токены Semgrep App и т.п.) — через GitHub Secrets, не в коде.

## Готово =

Зелёный CI с новыми jobs на PR (gitleaks+semgrep+trivy), еженедельный ZAP-workflow заведён, первый прогон разобран,
baseline-исключения зафиксированы осознанно, негативный тест на секрет валит PR. «Сканер зелёный» сам по себе — гейт,
не «готово»: перед словом «готово» — живой прогон и разбор первого шума.
