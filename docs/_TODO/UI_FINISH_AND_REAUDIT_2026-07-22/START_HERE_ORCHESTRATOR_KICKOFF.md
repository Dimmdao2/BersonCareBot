# START HERE — kickoff оркестратора (backend-first), 2026-07-23

Это единственный файл, который владелец даёт агенту при запуске. Агент выполняет всё сам — владелец git руками не
дёргает.

## Шаг 0 — синхронизировать ветку (агент делает сам)

```bash
cd <корень репо на боксе>
git fetch origin feat/doctor-ui-rebuild
git checkout feat/doctor-ui-rebuild
git reset --hard origin/feat/doctor-ui-rebuild   # рабочая интеграционная ветка; выравниваемся на origin
git log -1 --format='%h %s'                        # ожидаем свежий кончик feat (checkpoint + этот файл на месте)
```

## Шаг 1 — прочитать (целиком, в этом порядке)

1. `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/CHECKPOINT_2026-07-23_STATE_AND_BACKEND_WORK_ORDER.md`
   — точка старта: реальное состояние, открытые баги (§3), backend-first порядок работ (§4), лист решений владельца (§5).
2. `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/ORCHESTRATOR_PROMPT.md` — как вести оркестрацию (+ раздел про токены).
3. `docs/_TODO/UI_FINISH_AND_REAUDIT_2026-07-22/WORK_ORDER.md` — исходный наряд (Track A/B/C/D).
4. `AGENTS.md` и `docs/ORCHESTRATION_BINDINGS.md` — канон (особенно §«Документация и токен-дисциплина»).

## Шаг 2 — границы (прочитать внимательно, тут раньше была путаница)

- **TEST-сервер — основной рабочий полигон. Работать на нём по максимуму:** деплой `feat` через
  `bash deploy/host/deploy-test.sh feat/doctor-ui-rebuild`, ломать/наблюдать/чинить/перепроверять, пока не заработает.
  Тест-сервер деплоится ИЗ ветки `feat` (force-align) — отдельная ветка для этого НЕ нужна.
- **«Не пушить в `main`/`test`» — это про git-ВЕТКИ с такими именами, НЕ про тест-сервер.** Коммиты — только в
  `feat/doctor-ui-rebuild`. В git-ветки `main`/`test` не пушить. Прод (135.x) и prod-миграции — вне scope.
- Всё разрушающее (DROP таблиц, FORCE-RLS cutover) и юр-гейты — только после явного решения владельца.

## Шаг 3 — режим работы

- **Backend-first. Фронт (Track A) НЕ брать** — владелец принимает UI сам, отдельно. Идти строго по §4 checkpoint'а
  (P0 → P1 → P2 → P3).
- **Модели:** оркестратор + аудит high-risk (auth / tenant / деньги / миграции / данные / необратимое) = Opus;
  воркеры, тесты, механика, рефактор = Sonnet. Не тратить Opus на механику.
- **Токен-дисциплина (жёстко):** верификация обязательна, но евиденс — дешёвый/исполняемый (gate-скрипт как D0 или
  contract-тест), НЕ эссе. Статус писать В МЕСТЕ (галочка в плане + строка `id → PASS/FAIL → путь:строка | тест | SHA`).
  Новые reality-audit/reconciliation .md не плодить. Смелл-тест на границе этапа: доков больше, чем кода → стоп.
- **Коммитить и пушить регулярно в `feat/doctor-ui-rebuild`** (бэкап). CI: targeted-тесты на этапе, full CI на
  крупных гейтах и перед сдачей.

## Шаг 4 — первые действия (P0 из §4 checkpoint'а)

1. **Bug mark-read HTTP 500** — точное место в §3.1 checkpoint'а (`pgSupportCommunication.ts:1218` + грант в
   `deploy/postgres/p0-5b-grants.sql:373`). Починить (грант `UPDATE (read_at)` пациентской роли ИЛИ SECURITY DEFINER
   функция) + тест. Проверить на TEST-сервере.
2. **Isolation diagnostics CRITICAL `role_pool_mismatch`** (§3.3) — разобрать, не оставлять красным.
3. Собрать все вопросы, требующие решения владельца (§5 checkpoint'а: SMTP-креды для TEST, платный биллинг в
   первом прод-скоупе, age-ключ для backup DR-drill, и т.д.) **одним списком** и вернуть владельцу. Не гадать.

## Шаг 5 — дальше

Идти по §4: **P1** (security-CI стек Gitleaks/Semgrep/Trivy/CVE-скан; Track D D1→D2 — прямые записи integrator→public;
delivery-alerting P0/P-guard) → **P2** (PII flip-blockers; backup DR-drill; Track C R7 дроп rubitime) → **P3**.
Каждый этап — по «Циклу этапа» из `ORCHESTRATION_BINDINGS.md`: воркер → независимый аудит → приёмка. «audit PASS» ≠
«готово». Приёмка владельца — в середине, не только в финале.

---

_Если на боксе оркестрация читает статус из taskdb «мозга» (`/home/dev/brain/tools/taskdb.mjs`) — этот checkpoint
его ДОПОЛНЯЕТ как точку старта, оперативные карточки ведутся как обычно в taskdb._
