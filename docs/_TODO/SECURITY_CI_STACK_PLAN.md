> STATUS (verified 2026-07-23, code-reconciled): see docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md

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
- Сейчас security-тулинга (gitleaks/semgrep/trivy/zap) в репозитории **нет**.
- Прод-деплой — `deploy-prod.yml` (ручная кнопка на `main`).
- Тестовый сервер `test.bersoncare.ru` **IP-locked на VPN** (память `bcb-test-env-and-redirect-passthrough`) — важно для ZAP (ниже).

## Кадэнс (цель)

| Инструмент | На каждый PR | Еженедельно | Перед релизом |
|---|:--:|:--:|:--:|
| Gitleaks | ✅ | | |
| Semgrep | ✅ | | |
| Trivy (быстрый) | ✅ | | |
| Trivy (полный) | | | ✅ |
| OWASP ZAP | | ✅ | ✅ |
| Garak | *после появления AI-агентов в продукте* | | |

## Чек-лист внедрения

### Этап 1 — Gitleaks (очень высокий приоритет)
- [x] Новый job `secrets-scan` в `ci.yml` (PR + push): `gitleaks/gitleaks-action` или пинованный бинарь. (✓ .github/workflows/security.yml:24-49 job `gitleaks`, pinned binary v8.18.4, on: push[main]+pull_request | commit 2027f969)
- [x] Полноисторический скан хотя бы на push в `main` (не только diff) — прошлый инцидент был про содержимое `.env`. (✓ .github/workflows/security.yml:29-35 checkout `fetch-depth: 0` + `gitleaks git .` full-history | commit 2027f969)
- [x] `.gitleaks.toml` для осознанных allowlist (тестовые фикстуры/демо-креды — см. память `demo-test-fixtures-on-test-db`), чтобы не было ложных фейлов. (✓ .gitleaks.toml (52 lines, path-based allowlist for gitignored `.env` family) | commit 2027f969)
- [ ] Проверить, что реальный секрет валит PR (негативный тест на заведомом фейковом токене в отдельной ветке). (REMAINING: negative-secret test not yet run in a live PR)
- [x] fail-closed: находка high-confidence секрета = красный PR. (✓ .github/workflows/security.yml:39 `gitleaks git .` runs without `continue-on-error`, non-zero exit on finding = red build | commit 2027f969)

### Этап 2 — Semgrep
- [x] Job `semgrep` (PR): `semgrep ci` с рулсетами `p/default`, `p/typescript`, `p/react`, `p/nodejs`, `p/secrets`. (✓ .github/workflows/security.yml:52-77 job `semgrep`, pinned image semgrep/semgrep:1.85.0, `--config .semgrep.yml --config p/default --config p/typescript --config p/react --config p/nodejs --config p/secrets` | commit 2027f969)
- [ ] `.semgrepignore` для генератов (`.next/`, `dist/`, `node_modules/`, снапшоты тестов). (REMAINING: no .semgrepignore file yet)
- [x] Порог фейла: `ERROR`-severity валит PR; `WARNING` — аннотация, не блок (чтобы не заспамить на старте). (✓ .github/workflows/security.yml:71-72 `--severity ERROR --error` | commit 2027f969)
- [ ] Прогнать разово по всему репо, разобрать первый шум, зафиксировать baseline-исключения осознанно (не глушить массово). (REMAINING: first live-CI run + noise triage not yet performed)

### Этап 3 — Trivy
- [x] Job `trivy-fs` (PR, быстрый): `aquasecurity/trivy-action`, `scan-type: fs`, `scanners: vuln,misconfig,secret`, `severity: HIGH,CRITICAL`. (✓ .github/workflows/security.yml:80-105 job `trivy-fs`, `aquasecurity/trivy-action@0.28.0`, scan-type fs, scanners vuln,misconfig,secret, severity HIGH,CRITICAL, exit-code 1 | commit 2027f969)
- [x] `.trivyignore` для принятых/неустранимых сейчас CVE (с комментарием-обоснованием и датой ревью). (✓ .trivyignore (14 lines) wired via `trivyignores: .trivyignore` at .github/workflows/security.yml:103 | commit 2027f969)
- [ ] Полный режим (`severity` без фильтра, + `--scanners` расширенный) — отдельный job/workflow перед релизом, не на каждый PR. (REMAINING: dedicated pre-release full-severity Trivy job not yet built)
- [x] Согласовать с существующим `pnpm run audit` (Trivy шире — деп-CVE + misconfig + secret; не дублировать смысл, а дополнять; при желании оставить только Trivy). (✓ resolved via new dedicated job — `package.json:93` `audit:cve`: `pnpm audit --audit-level=high`, run by `dependency-audit` job at .github/workflows/security.yml:107-115; existing `ci.yml` `audit` job left as-is for saas-regression, no overlap | commit 2027f969)

### Этап 4 — OWASP ZAP (DAST)

**Режимы (решение владельца 2026-07-19; техническое уточнение 2026-07-19):**
- **Baseline** — отправляет обычные HTTP/spider-запросы и проходит доступные ссылки, но не запускает active attack
  payloads. Он не должен менять состояние при корректных GET-контрактах, однако это всё равно сетевой скан, а не
  «только наблюдение»; по проду разрешается лишь после отдельного review target/rules.
- **Активный (active scan)** — атакующий: инъекции в формы, отправка запросов → мусорные данные, возможные реальные
  отправки пациентам, нагрузка. Разрешён ТОЛЬКО по тесту/эфемерной копии. **По проду активный — ЗАПРЕЩЁН.**

**Карта целей:**

| Где | Режим | Доступ | Кадэнс |
|---|---|---|---|
| Тест (`test.bersoncare.ru`) / эфемерная копия | активный (ломать можно) | **вариант 2**: снять IP-запрет ТОЛЬКО для диапазонов IP GitHub-раннеров, узким **авто-закрывающимся окном** (открыть перед сканом → скан → сразу закрыть, в т.ч. при падении) | еженедельно + перед релизом |
| Прод (после 1-го прод-деплоя) | **только baseline**, после owner-approved target/rules review | публичный, достаём напрямую (VPN не при чём) | еженедельно + после каждого релиза |

- [ ] Отдельный workflow `zap.yml`: `schedule` (еженедельно) + `workflow_dispatch` (перед релизом). НЕ на каждый PR. (REMAINING: whole ZAP stack not yet built)
- [ ] **Тест, вариант 2:** тянуть актуальные IP-диапазоны GitHub Actions (api.github.com/meta) и открывать IP-allowlist теста только им; окно узкое и авто-закрывается (шаг закрытия — `if: always()`). (REMAINING: whole ZAP stack not yet built)
- [ ] Учесть, что hosted-runner ranges общие для разных GitHub-клиентов: в окно тест содержит только синтетику,
      не содержит prod-секретов, окно имеет аварийный timeout/cleanup и отдельный owner-approved threat review. (REMAINING: whole ZAP stack not yet built)
- [ ] **Тест — активный скан по СИНТЕТИКЕ, не прод-дампу** (безопасный дефолт владельца 19.07): гнать активный скан по тесту, залитому демо-фикстурами (память `demo-test-fixtures-on-test-db`), а не прод-дампом. Активному скану нужен наш код/роуты, а не реальные PII; так закрывается остаточный риск «диапазоны GitHub общие». (Хочет владелец по прод-дампу — отдельное подтверждение.) (REMAINING: whole ZAP stack not yet built)
- [ ] **Прод — ТОЛЬКО baseline после owner-approved target/rules review**, добавляется в скоуп после первого
      прод-деплоя. Активный по проду не запускать никогда. (owner/legal-gated: prod DAST scanning requires owner-approved target/rules review before any run, per policy above)
- [ ] Отчёт артефактом; триаж находок владельцу, не авто-фикс. (REMAINING: whole ZAP stack not yet built)

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
