# План: безопасность, стабильность и проверяемость (2026-07-21)

**Статус:** owner-activated subordinate execution artifact. Порядок относительно Product UX, privacy/readiness и
коммерческих этапов задаёт только
[`SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`](SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md).
Этот файл не создаёт второй roadmap и не является разрешением на TEST/PROD/host/database actions.

Источник: аудит архитектуры по 8 осям (изоляция слоёв, БД-доступ, контракты, когезия/стабильность,
качество тестов, наблюдаемость, устойчивость/конкурентность, безопасность+зависимости).

## Цель
Замкнуть критичные гарантии системы — **изоляцию тенантов** и **целостность денег/данных** —
сквозным ТЕСТОМ в CI и сквозным ДЕТЕКТОМ в проде, и снять остаточный долг по безопасности,
наблюдаемости и контрактам. Не «полировать структуру» (она здоровая), а сделать несущие
гарантии *проверяемыми*, а не держащимися на честном слове.

## Definition of Done (жёстко)
Пункт считается технически закрытым только при: (1) галочка в этом файле; (2) риск-соразмерные targeted checks;
(3) один full CI на phase/milestone gate, а не после каждого мелкого слайса; (4) живая проверка, где она действительно
нужна и достижима. TEST-проверка/deploy выполняется только после отдельного разрешения владельца. «Audit PASS» и
«зелёные моканые тесты» сами по себе — НЕ «готово». Обычная работа идёт repository/DEV-only; pending DEV migrations
применяются только каноническим недеструктивным `deploy/host/migrate-dev.sh`, без dump/reset. TEST/PROD/host и
production activation остаются отдельными owner gates.

## Правило источника скоупа
Скоуп берётся ТОЛЬКО из этого файла (владелец авторизовал его findings→план явно). Находки аудиторов,
которых здесь нет, — вопрос владельцу, а не новая работа. >2 correction-раундов на одном этапе без закрытия
его чек-листа = СТОП + эскалация.

## Нулевой reconciliation gate — до новых задач и кода

План возник после большого объёма уже интегрированной SaaS/Foundation-работы, поэтому ни один пункт нельзя считать
автоматически новым долгом. Перед первым worker оркестратор сопоставляет каждый пункт с текущим кодом, taskdb и
актуальными evidence:

- `#770` — locked/FORCE runtime coverage;
- `#797` — tenant-wall diagnostics в System Health;
- `#933` — milestone CI и locked-mode test harness;
- `#934` — актуальный dependency audit;
- `#881` — отдельный канон Security CI, который здесь не дублируется.

Статус каждого подпункта: `covered`, `residual_gap`, `dependency_waiting`, `owner_gate` или `post_launch`. Новая
taskdb-карта создаётся только для доказанного `residual_gap` с точным file scope; существующие карты не дублируются.
В частности, A1/A3/A4/F1 не запускаются как «переписать заново» до этой сверки.

### Reconciliation result — current branch, 2026-07-21

| Item | Status | Current truth / exact residual |
|---|---|---|
| A0 | `covered` | `#938` закрыт интеграционными коммитами `dd4241f65` + `b6222cd40`: versioned PII-free schema baseline, repo-bound ledger manifest, synthetic `.test` seed, disposable restore/pending-migration proof и fail-closed signal cleanup прошли полный независимый re-audit. A0 доказывает DDL/migration reproducibility, не RLS от owner-role. |
| A1 | `residual_gap` | `#770/#933` закрывают runtime chokepoint и generic harness; после закрытого A0 следующий исполнимый residual — CI PostgreSQL с canonical ACL/runtime roles и locked/FORCE two-org/no-principal/principal-full route proof только от non-owner principals. Synthetic minimal schema и `bcb_a0_owner` как RLS evidence запрещены. |
| C2 | `residual_gap` | Logger APIs существуют, но нет единого ALS/header correlation + organization context webapp→integrator→worker. Нужен typed low-cardinality context без DB/network hot-path. |
| F1 | `residual_gap` | `#934` закрыл текущие advisories; updater automation отсутствует, `shadcn` остаётся runtime dependency. Не дублировать `#881/#934`. |
| D3 | `residual_gap` | Dev bypass обычно fail-closed в PROD, но env parser не отвергает саму комбинацию `production + flag`, а clinic-invite callsite сохраняет неоднозначную ветку. Нужен startup hard guard + tests. |
| A3 | `dependency_waiting` | `#797` уже дал tenant diagnostics; residual — включить существующие isolation/missing-principal signals и bounded went-dark canary в critical health, не строить вторую диагностику. |
| B1 | `dependency_waiting` | Payment event record → capture → processed имеет crash window, а duplicate может не довести capture. Сначала executable proof, затем transaction/replay-safe UoW. |
| B2 | `dependency_waiting` | Payment/OAuth calls не имеют общего timeout boundary. Нужен shared timeout + error mapping, без расширения retry policy. |
| B3 | `dependency_waiting` | Online availability check отделён от appointment insert; очный exclusion constraint не закрывает online/null-capacity. Нужны lock/constraint и двухсоединительный proof. |
| C1 | `dependency_waiting` | Error tracker/release adapter отсутствует. Repository/DEV self-hosted path ждёт Phase 0 + `LOG-01`; host activation остаётся `SEC-02/PR-04` owner gate. |
| D1 | `dependency_waiting` | `#919`/migration `0215` уже дают staff `session_version`, но doctor TTL остаётся 90 дней. Residual — короткий doctor TTL и revocation без per-request DB round-trip с p95 proof. |
| D2 | `dependency_waiting` | Центрального Origin/Sec-Fetch-Site CSRF guard нет; нужны точные M2M/webhook/public-auth exemptions и negatives. |
| E2 | `dependency_waiting` | Общего server response/error mapper нет. Внедрять только helper + launch-risk routes, не массовую косметическую миграцию. |
| E3 | `dependency_waiting` | Integrator↔webapp event contract продублирован вручную и JSON artifact расходится. Нужен один shared Zod SSOT и runtime validation на обоих концах. |
| A4 | `dependency_waiting` | Большой chokepoint уже в основном закрыт `#770/#797`; после ранних фаз выводится только exact launch-critical exception/manual-NULL matrix. Старое число файлов не является автоматическим scope. |
| A2 | `dependency_waiting` | `#652` и существующие real-policy proofs репрезентативны, но не покрывают каждый чувствительный домен через live RLS route. Ждёт A1/A4 matrix. |
| C3 | `post_launch` | Prometheus exporter отсутствует; раньше запуска допускается только точный low-cardinality signal, если его требует C6/release gate. |
| F2 | `post_launch` | God-components остаются, но их structural split идёт после UX stabilization. |
| F3 | `post_launch` | Booking/notifications фрагментированы; сначала ownership map, без pre-launch behavioral rewrite. |

Первый исполнимый порядок: **A0/#938 целиком** → **A1/#937 целиком** → independent adversarial audit → **C2/F1/D3** в трёх непересекающихся
worktree после стабилизации A1 contract (допустимо начать, пока идёт независимый A1 audit) → один общий Phase 0
full-CI milestone. Dependency install/audit, heavy lint/CI и единственный DEV server сериализуются. Только после этого
открываются Phase 1 A3/B1/B2/B3/C1. Reconciliation не создаёт дочерние taskdb-карты заранее: exact stage card
появляется перед worker после file-scope launch manifest.

---

## 🔀 Развилки владельца — РЕШЕНО (владелец, 21.07)

| # | Развилка | Решение |
|---|---|---|
| F-1 | Глубина RLS-cutover (A4) | **Fail-closed + детект СЕЙЧАС**; полный cutover — отдельный follow-up |
| F-2 | Трекинг ошибок | **Self-hosted**, dark-launch (данные не покидают бокс) |
| F-3 | Сессии | **Ревокация + короткий TTL врача** (low-overhead дизайн, см. ниже) |
| F-4 | Метрики | **Phase 4**, только pull-модель + низкая кардинальность |
| F-5 | Матрица cross-tenant тестов | Стартовый тир: patients/PII, payments, bookings, messaging, diaries |

## ⚡ Сквозной load-бюджет (жёсткий критерий приёмки, владелец 21.07)
Каждый пункт обязан доказать **околонулевую стоимость в steady-state hot-path**. «Работает» без «не грузит» = НЕ done.
Общие запреты: (1) никакого нового per-request DB round-trip; (2) никакой синхронной сети в request-path;
(3) метки метрик — только низкой кардинальности (НЕ orgId/userId); (4) новые фоновые задачи цепляем к
существующему 5-мин operator-health тику, а не плодим шедулеры. На тесте — замер до/после (latency p95, DB-pool,
RSS) как часть приёмки этапа.

**Классификация пунктов по нагрузке:**
- _Снижают нагрузку:_ B2 (таймауты освобождают зависшие коннекты), B1 (tx дешевле recovery орфанов).
- _Нулевая hot-path:_ A1 (CI-only), A3/C2 (переиспользуют уже собираемые in-process счётчики и principal-ALS),
  B3 (advisory-lock только на booking-create, редкий путь; ещё лучше — partial constraint = 0 рантайма),
  D2/D3/E2/E3 (string-compare / build-time / init-time), C1 (событие только на ошибке, async, traces sample=0).
- _Load-чувствительные (делать по cheap-дизайну ниже):_ **D1 сессии**, **C3 метрики**, и присущая цена **RLS (A4)**.

---

## Фазы (секвенированы по риску и зависимостям)

### Phase 0 — Фундамент проверяемости (keystone, разблокирует всё)
- [x] **A0. PII-free greenfield baseline для CI (`#938`, prerequisite A1).** Версионированный структурный baseline
      из текущей подготовленной DEV-схемы (`pg_dump --schema-only --no-owner --no-privileges`, без строк данных),
      точный manifest обоих migration ledgers и минимальный детерминированный seed на зарезервированных
      недоставляемых `.test` идентичностях, достаточный для data-state migration guards. Disposable verifier обязан:
      восстановить baseline в приватный ephemeral PostgreSQL, проверить отсутствие data rows до seed, применить seed,
      прогнать все pending current migrations и доказать ledger completeness/drift. Historical migrations не
      переписываются; raw DEV dump, TEST/PROD, runtime DB и synthetic partial schema запрещены. Baseline обновляется
      только отдельным осознанным schema-stage, не каждым code deploy.
      Размер: **M** · Аудит: **полный адверсарный** (migration integrity + PII-free artifact).
      **Закрыто 2026-07-21:** интеграционные коммиты `dd4241f65` + `b6222cd40`; static gate `6/6`, обычный и
      append-only disposable restore, SIGTERM-during-migration cleanup и полный независимый re-audit — PASS.
- [x] **A1. RLS-conformance harness в CI.** Поднять Postgres-сервис в `ci.yml`, прогнать миграции в `locked`-режиме,
      посеять org A + org B, три ассерта: (а) принципал видит только свою орг; (б) **запрос без принципала под
      FORCE-RLS → пусто/ошибка, но НЕ строки чужой орг**; (в) principal-full видит строки. Завести в мерж-гейт.
      _Почему keystone: без этого A2/A4/B1/B3 нечем верифицировать против реальности._
      Файлы: `.github/workflows/ci.yml`, `apps/webapp/vitest.setup.ts:30`, `vitest.globalSetup.ts`, `package.json:test:with-db`.
      Размер: **M** · Аудит: **полный адверсарный** (это про изоляцию).
      **Закрыто 2026-07-21:** интеграционные коммиты `296ec6e33` + `14c9b7ca7`; dedicated CI gate поднимает
      приватный ephemeral PostgreSQL из A0 baseline, применяет актуальные миграции и доказывает own-org access,
      cross-org denial, principal-full access и буквальный FORCE-RLS fail-closed без signed principal для обоих
      canonical non-owner runtime login. Независимый полный re-audit — PASS; итоговый verifier — PASS (`5/5`).
- [ ] **C2. `orgId` + сквозной correlation-id в стандартный контекст pino** (webapp→integrator→worker).
      Разблокирует трассировку и A3. Файлы: `apps/*/src/**/logger.ts`, request-middleware/proxy. Размер: **S-M** · Аудит: один.
- [ ] **F1. dependabot/renovate + `shadcn` → devDependencies** (снимает 2 high из прод-дерева). Размер: **S** · Аудит: один.
- [ ] **D3. Hard-guard `ALLOW_DEV_AUTH_BYPASS`** — throw при `NODE_ENV=production` на этапе парсинга env.
      Файлы: `apps/webapp/src/app/api/clinic/invites/route.ts:70`, `config/env`. Размер: **S** · Аудит: один.

### Phase 1 — Максимальное снижение риска (параллельно, независимые file-scope)
- [ ] **A3. Замкнуть детект в проде.** Завести isolation-события (`missing_principal`) в 5-минутный
      `collectCriticalHealthSignals` алерт-тик + добавить per-org «went-dark» канарейку (падение row-count/активных орг в ноль).
      Файлы: `app-layer/health/collectCriticalHealthSignals.ts`, `infra/db/saasIsolationDbFailureReporting.ts`,
      `infra/db/webappPoolProvider.ts`. Размер: **S-M** · Аудит: полный (детект изоляции).
- [ ] **B1. Атомарность захвата платежа.** СНАЧАЛА verify-spike (доказать окна краша живьём), затем: обернуть
      record-event + capture + mark-processed в одну транзакцию ЛИБО сделать capture полностью replay-safe
      (повторная доставка `duplicate` доводит незавершённый захват). Файлы: `payments/service.ts:330-461`.
      Размер: verify **S** + fix **M** · Аудит: **полный** (деньги).
- [ ] **B2. `fetchWithTimeout` на все платёжные/OAuth-вызовы** (Yookassa/Tinkoff/Apple/Google) — переиспользовать
      существующий `fetchWithTimeout` из `operatorHealthProbeRunner.ts`. Размер: **S** · Аудит: один.
- [ ] **B3. Закрыть онлайн-слот TOCTOU** — advisory-lock на `(org, slotStart)` вокруг `assertSlotAvailable`+insert
      ИЛИ partial exclusion/unique на онлайн-ёмкость (паритет с очным GiST-констрейнтом).
      Файлы: `canonicalCreate.ts:161-203`. Размер: **S-M** · Аудит: полный (конкурентность+деньги).
- [ ] **C1. Трекинг ошибок** (self-hosted per F-2) в 3 сервиса + release-теги. Размер: **M** (вкл. инфру) · Аудит: один.

### Phase 2 — Остаточная безопасность + контракты (параллельно)
- [ ] **D1. Ревокация сессий** (per F-3): серверная таблица версий/`jti`-денилист → точечный «выйти везде»
      без глобального разлогина; TTL врача заметно ниже 90д. Файлы: `modules/auth/sessionCookie.ts:10-97`.
      Размер: **M** · Аудит: полный (auth).
      **Load-дизайн (обязателен):** НЕ читать БД на каждом запросе — это убьёт stateless-выигрыш. Держим HMAC-куку
      как есть; ревокацию проверяем против **in-memory кэша session-version с коротким TTL (30-60с) + инвалидация
      на revoke**, ИЛИ денилист только *активно отозванных* `jti` (крошечный, set-membership за наносекунды).
      Ревокация — событие редкое, поэтому steady-state = 0 обращений к БД. Приёмка: доказать, что p95 auth-запроса
      не вырос.
- [ ] **D2. CSRF/Origin-проверка** на мутирующих роутах как defense-in-depth поверх `SameSite=lax`.
      Размер: **S-M** · Аудит: один.
- [ ] **E2. Общий `jsonOk/jsonError` builder + маппер ошибка→HTTP.** Внедрение инкрементальное; новые роуты обязаны,
      старые мигрируют волной. Размер: **M** (helper) + постепенная адаптация · Аудит: один.
- [ ] **E3. Единая zod-схема границы integrator↔webapp** — заменить 3 определения (JSON-док + zod интегратора +
      ручные `typeof` в приёмнике) одним SSOT, рантайм-валидировать на обоих концах. Убрать осиротевшие `contracts/*.json`.
      Файлы: `apps/webapp/src/app/api/integrator/events/route.ts:18-31`, `apps/integrator/src/kernel/contracts/schemas.ts:56`.
      Размер: **M** · Аудит: полный (кросс-сервисный контракт).

### Phase 3 — Большой cutover (длинный полюс, высший риск, приёмка владельца по кускам)
- [ ] **A4. Довести класс #821/#815** (объём per F-1): «нет принципала → fail-closed», ретайр несущих ручных
      `org_id … OR IS NULL`-фильтров (~87 файлов) по мере покрытия A1/A2. Свести отдельные пулы (migrator/media-worker/
      integrator) к принципал-aware доступу или явно задокументировать их как infra-исключения.
      Размер: **XL** (10-20+ dd, высокий риск) · Аудит: **полный адверсарный, по каждому куску** · Приёмка: поэтапная.
      **Load-заметка (честно):** RLS-энфорсмент — единственный слой с ПРИСУЩЕЙ per-request ценой (`SET ROLE` +
      `install_signed_context` на каждый checkout пула), и A4 делает её универсальной. Это дешёвые GUC/функц-вызовы,
      амортизируются пулом, но не ноль. Обязательно: **бенчмарк p95 на тесте под нагрузкой ДО раскатки** (locked-режим
      уже на dev — есть с чем сравнить), и оптимизация checkout (кэш подготовленного контекста на коннекте, чтобы
      не переустанавливать роль без смены принципала). Если замер покажет заметный рост — это owner-gate, не молчком.
- [ ] **A2. Матрица cross-tenant регрессий** (тир per F-5): через настоящие route-handlers под живым RLS
      (не in-memory), по одному тесту на чувствительную таблицу. Размер: **L** · Аудит: полный.
- [ ] **E1. Расширить eslint-границу** на `page.tsx`/RSC + остальной `infra` (payments/webhooks/integrations) +
      запрет прямого `drizzle-orm` в роутах; выжечь legacy-allowlist (~24 файла) по мере рефактора сервисов на порты.
      Файлы: `apps/webapp/eslint.config.mjs`. Размер: **L** (ongoing) · Аудит: один на волну.

### Phase 4 — Дальнейшее (по ёмкости, не блокирует)
- [ ] **C3. Метрики** (per F-4): latency, насыщение пула БД, глубина очереди → экспорт/скрейп.
      **Load-дизайн (обязателен):** только **pull-модель** (Prometheus скрейпит `/metrics` раз в 15-30с) —
      в hot-path лишь инкремент атомарного счётчика в памяти (наносекунды), никакой сети на запрос.
      Переиспользуем уже существующие in-process счётчики (`webappPoolProvider`: missingPrincipalSelections,
      poolRoleMismatches) — не добавляем новую инструментацию на горячий путь. **Метки только низкой кардинальности**
      (route-class, status, provider) — НИКОГДА orgId/userId (иначе взрыв кардинальности → рост RSS и медленный скрейп).
      Гистограммы latency — с ограниченными бакетами, не на каждый вызов. Итог: метрики — самый ДЕШЁВЫЙ слой
      наблюдаемости при таком дизайне; «нагрузка» возникает только от плохой кардинальности, которую тут запрещаем.
- [ ] **F2. Разбор UI god-компонентов** (2000-2500 строк: TreatmentProgram*, ScheduleCalendarTab, PatientTabKarta).
- [ ] **F3. Де-фрагментация модулей** (нотификации по ≥6 модулям, booking по 4 слоям) — консолидация владения.

---

## Карта параллелизации
- **Phase 0**: A0 сначала делает полную ephemeral DB воспроизводимой без PII; затем A1 доказывает current conformance.
  Только после этого
  подтверждённые residual C2/F1/D3 могут идти параллельно друг другу. Старая схема «запустить всё рядом с A1» не
  применяется, потому что могла дублировать уже закрытый Foundation scope.
- **Phase 1**: A3, B1, B2, B3, C1 — независимые file-scope → до 3 воркеров одновременно, каждый в своём worktree.
- **Phase 2**: D1, D2, E2, E3 — независимы от Phase 1 и друг от друга → параллельно.
- **Phase 3**: A4 — длинный полюс, гонится своим темпом с приёмкой по кускам; A2 и E1 цепляются к прогрессу A4.
- Сериализуется только конкуренция за общий ресурс (heavy CI под mutex, живой dev-сервер под скрин).

## Приёмка в середине
После Phase 1 — только при отдельном прямом разрешении владельца выкатить накопленное на ТЕСТ (code-only) и
передать владельцу на click-through до старта Phase 3. Без такого разрешения фиксируется готовый DEV/evidence packet,
а TEST deploy остаётся pending owner gate. Не полировать A4, пока Phase 0-1 не приняты живьём либо владелец явно не
перенёс этот checkpoint.

## Оценка объёма (честно)
- **Risk-closing спина (Phase 0 + Phase 1)**: ~**2.5–4 недели** сфокусированной работы с параллелью.
  Даёт ~80% снижения риска: инвариант изоляции становится проверяемым в CI и детектируемым в проде,
  деньги — атомарны, внешние вызовы — с таймаутами, ошибки — видимы.
- **+ Phase 2** (безопасность+контракты): ещё ~**2–3 недели**, хорошо параллелится.
- **+ Phase 3** (полный RLS-cutover A4 + матрица + границы): **длинный полюс, ~4–8 недель**, доминирует риском и объёмом.
- **Итого «максимально bulletproof»**: программа масштаба **~1 квартала** сфокусированного темпа,
  НО тиированная: критичное закрывается в первые ~1 мес, остальное — управляемый долг с приёмкой по кускам.

Короткий ответ на «большой ли объём»: **да, полная программа — квартал**, но она не монолит —
львиная доля риска снимается фундаментом Phase 0-1 за ~месяц, а самый тяжёлый и рискованный кусок (A4)
изолирован в конце и гонится отдельным темпом под адверсарным аудитом.
