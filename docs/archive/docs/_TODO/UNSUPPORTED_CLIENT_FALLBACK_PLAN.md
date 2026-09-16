# План: заглушка и телеметрия для неподдерживаемых устройств (patient auth entry)

Статус: owner-activated planning, execution mapped by the canonical Product UX roadmap · 2026-07-21.
Документ является подчинённым implementation artifact, не вторым roadmap и не разрешением на TEST/PROD deploy,
production telemetry или host changes.
Контекст-инцидент: клиент (iPhone, iOS 15.5) 21.07 ~13:08 МСК завис на «проверка авторизации».
Доказано по логам прода: все ответы `200`, но браузер **ни разу** не вызвал `/api/*` — модульный
JS-бандл (Next 16 / React 19) молча не выполнился на старом WebKit. Сервер здоров, вход у других работал.

## Цель

Вместо вечного спиннера показать клиенту **точное или предположительное** объяснение
(«браузер/ОС/устройство устарели, либо нет места»), показать понятную SSR-заглушку и минимизированно зафиксировать
технический сигнал —
и при этом **НЕ** отображать это как деградацию «Здоровья системы» и НЕ как нашу ошибку.

## 🔴 Жёсткие ограничения (это не «Здоровье системы» и не наш сбой)

Проверено в коде, нарушать нельзя:

1. **НЕ вызывать `recordAuthRegistrationFailure` для этих событий.** `classifyRegistrationErrorCode`
   (`modules/auth/registrationErrorClass.ts:51`) неизвестный код → `"system"` → audit-лог
   `status:error` → счётчик системных сбоев (`loadAdminRegistrationFailureAttention`,
   `useDoctorRegistrationSystemFailureCount`). Использовать ОТДЕЛЬНЫЙ канал события.
2. **НЕ регистрировать operator-health probe/checker.** «Здоровье системы» = `modules/operator-health`
   (крон, delivery-backlog, push-outbox, `adminHealthThresholds`). Новое событие туда не добавлять.
3. **Уровень лога = info/warn, никогда error.** Никаких `writeAuditLog(status:"error")`.
4. Собственный `eventType: "client_boot_unsupported"` и отдельная админ-карточка остаются dormant до C6 +
   `LOG-01` payload/retention gate и доказанной пользы Ф0. Если они активируются, событие не является
   `auth_register_failure`, а карточка явно помечается как клиентская совместимость, не инцидент.
5. Приёмочный тест: отчёт о boot-фейле НЕ увеличивает системный счётчик сбоев и НЕ создаёт error-audit-строку.

## Архитектура (единый чокпоинт, fail-open)

- Одна серверно-отрисованная заглушка + один инлайновый **classic**-скрипт-watchdog, вставленные
  ОДИН раз в шелл patient-входа (layout, рендерящий `AuthBootstrap`: `/app`, `/app/tg`, `/app/max`).
- Fail-open: заглушка показывается только когда приложение ТОЧНО не стартовало; здоровый клиент не трогаем.
- Watchdog обязан работать на «мёртвом» движке: classic inline `<script>`, ES5-safe, без модулей и зависимостей.
- Отображаемый текст рендерится сервером из UA (должен работать при нуле JS); клиентский JS — только уточнение.

## Компонент 1 — Детект (client watchdog)

Инлайновый ES5-safe скрипт в шелле входа:

1. `t0`, `window.__bcBootWatch = { ok: fn }`, слушатели `error` / `unhandledrejection` (ловят ошибку парса/исполнения модуля).
2. Ранняя точка React-энтри зовёт `__bcBootWatch.ok('module_executed')`; `AuthBootstrap` на mount — `ok('react_mounted')`.
3. Таймер `WATCHDOG_MS` (старт ~10с, тюнится). Не отменён → `showFallback()`:
   раскрыть скрытую SSR-заглушку + собрать сигналы + отправить маячок.
   Различение причин (для текста и телеметрии):

- `module_never_executed` (+ SyntaxError/нет ошибки) + UA ниже матрицы → **старый движок** (определённо).
- `module_executed` но не `react_mounted` → рантайм/хидрейшн-фейл (тоже старый движок/битый кэш).
- `sw_registration_failed` / `navigator.storage.estimate()` близко к квоте → **нехватка места**.
- `module_executed` + `react_mounted`, но вход не завершился → это НЕ кейс заглушки (это уже внутренние
  таймауты `MESSENGER_*`), watchdog в этом случае отменён — не путать причины.

## Компонент 2 — Идентификация устройства/браузера (формулировка)

Тон ВСЕГДА тёплый и предположительный (решение владельца) — мы не обвиняем устройство, а помогаем.
Специфику показываем как факт, когда уверены, но тон от этого не меняется.

- Первично **сервер**: парс `User-Agent` на рендере входа → `{osName, osVersion, browserName, browserVersion, isInAppWebView, confidence}`.
- Базовое сообщение (см. «Текст заглушки») показывается при ЛЮБОМ boot-фейле — оно уже предположительное,
  покрывает и старый движок, и нехватку места.
- Если UA уверенно распарсен — доп. приглушённая строка с фактом: «Ваше устройство: iPhone, iOS 15.5, Safari»
  (информативно, для пользователя и поддержки; без формулировки «ваше устройство устарело»).
- ⚠️ Честно: точную МОДЕЛЬ железа iOS-UA не отдаёт (только «iPhone») — показываем ОС/браузер/версию
  (это достоверно). На Android модель часто есть в UA — можно указать.
- Матрица `supportedClientMatrix.ts` НЕ гейт и НЕ меняет тон — только (а) бакетирование в телеметрии Ф0,
  (б) опционально: ниже явного «очень старого» порога можно чуть сильнее подсветить «обновите». Значения —
  мой вызов, стартовые (уточняются по факту в Ф0): iOS/Safari < 15, Chrome/Chromium < 100, Firefox < 100,
  Samsung Internet < 20, всё нераспарсенное → без специфики, только базовый текст.
  Baseline бандла для ВСЕХ НЕ понижаем — живую систему ради одного устройства не трогаем.

## Текст заглушки (RU, утверждён владельцем как рыба; финально причесать при Ф1)

Заголовок: **«Что-то пошло не так на вашем устройстве»**
Тело: «Мы очень хотим, чтобы у вас всё заработало. Похоже, приложению не удалось запуститься —
возможно, стоит обновить браузер, операционную систему или попробовать открыть с другого устройства.
Если не получится — напишите нам, мы поможем.»
Ниже: кнопка/ссылка в поддержку (SSR, работает без JS) + приглушённая тех-строка с UA (если распознан).
Опционально: подсказка открыть свежую ссылку из бота (на случай просроченного entry-токена).

## Компонент 3 — Логирование / телеметрия

- Новый лёгкий ingress `POST /api/patient-app/client-boot-report`: неавторизованный (юзер не залогинен),
  zod-валидация, лимит размера, rate-limit.
- Payload: `entrySurface` (tg/max/pwa/browser), минимизированные UA-поля, `failureSignals` (moduleExecuted,
  capturedError category без raw stack/body, swState, coarse storage bucket, featureProbes), `timingMs` и случайный
  correlation id. Прямой `telegramId`/`integratorUserId`, entry-token и raw subject не передаются. Если для
  диагностики позже понадобится связь с аккаунтом, она проектируется как отдельный pseudonymous server-side lookup
  после privacy/retention review; нельзя утверждать, что UA и корреляция «не являются ПДн» без этого gate.
- Структурный лог: `scope:"patient_client_env", event:"unsupported_client_boot", level:info`. НЕ error.
- Persist: product-analytics новым `eventType:"client_boot_unsupported"` допускается только после сверки с C6 и
  `LOG-01` (retention, cardinality, payload hygiene). Без этого gate работает только минимизированный bounded ingress
  и структурный технический сигнал без клинического/сообщенческого содержимого.

## Компонент 4 — Уведомления: НЕ делаем (решение владельца)

Это не проблема системы → никаких уведомлений: ни врачу, ни владельцу, ни агрегатов, ни баннеров.
Только пассивная телеметрия (Компонент 3) для нашей диагностики. Админ-карточка Ф2 — тоже пассивная
(просмотр по запросу), не уведомление; делаем только если по факту Ф0 это окажется полезно, иначе не тратим.

## Фазы (чек-лист; аудит по риску — presentation/механика = worker + ОДИН независимый аудит)

> **⛔ ПЕРЕД СТАРТОМ ЭТАПА — перечитать, не по памяти:** `AGENTS.md` (§24 оркестрация, §7-9 коммит/CI/пуш feat),
> `docs/ORCHESTRATION_BINDINGS.md`, `docs/ORCHESTRATOR_CHECKLIST.md`, правила ведения документации и логов,
> релевантные `.cursor/rules/*.mdc` по теме этапа. Агентов запускать только через `tools/orch-launch.sh`.
> **НЕ ИЗОБРЕТАТЬ:** почти всё уже описано в документах репозитория. Сначала искать готовое
> (`node /home/dev/brain/tools/code-search.mjs "<q>" --repo bcb`), переиспользовать существующее; своё писать
> только если готового нет — и написать в коммите, почему готовое не подошло.

- [x] **Ф0 — Диагностика без UI.** Repository/DEV: watchdog + маячок, заглушка за флагом/выключена,
      synthetic forced-failure proof. Реальный сбор несколько дней начинается только после отдельного
      owner-authorized TEST/production activation; отсутствие такого окна не разрешает скрыто включать сбор.
- [ ] **Ф1 — Заглушка (точная + предположительная).** SSR, за фиче-флагом. Верификация на тест-сервере
      реальным старым Safari (или UA-спуф + принудительный фейл модуля).
- [ ] **Ф2 — Админ-карточка «Совместимость устройств»** (счётчики по ОС/браузеру/surface, последние N).
      Пассивный просмотр, помечена как клиентская, не инцидент. Делаем ТОЛЬКО если Ф0 покажет пользу; иначе пропускаем.
- [x] ~~Ф3 — Уведомления~~ — ОТМЕНЕНО владельцем (не проблема системы); `[x]` означает owner-cancelled, не implementation.
- [ ] **Ф-guard — приёмочные тесты ограничений:** grep, что SystemHealthSection / operator-health /
      loadAdminRegistrationFailureAttention НЕ ссылаются на новое событие; тест «boot-report не растит
      системный счётчик и не пишет error-audit».

### Execution reconciliation — current feature branch, 2026-07-21

`Ф0/Ф1` готовы к bounded repository implementation без дополнительного owner decision:

- `/app`, `/app/tg` и `/app/max` уже сходятся в один server entry `AppEntryRsc` и один `AuthBootstrap`; watchdog,
  SSR fallback и server-first UA presentation должны встраиваться в этот chokepoint, а не дублироваться по routes;
- текущий `AuthBootstrap` уже отделяет messenger timeout от browser interactive flow и имеет ранний mount-effect;
  существующие `MESSENGER_*` таймауты сохраняются и не классифицируются как boot failure;
- отдельного `client-boot-report`, `supportedClientMatrix` или classic-script watchdog сейчас нет;
- feature toggle добавляется как global public DB-backed `system_settings` runtime setting с fail-closed default `false`;
  новый env-флаг запрещён;
- ingress переиспользует общий trusted `X-Real-IP` resolver и DB-backed sliding-window rate-limit port. Payload
  остаётся bounded/minimized; persistent product analytics, account lookup и admin card не входят в `Ф0/Ф1`;
- exact initial file families: `AppEntryRsc`/server entry presentation, one patient boot-fallback component/script,
  `AuthBootstrap` mount acknowledgement, one auth-module report contract/rate-limit, one API route, typed settings
  registry/projection and focused tests. `SystemHealthSection`, registration-failure and operator-health runtime code are
  protected except negative invariant tests;
- acceptance must include HTML proof with zero module execution, healthy-client cancellation, module-executed vs
  React-mounted distinction, bounded/rate-limited ingress, payload rejection, no raw identifiers/tokens/stacks, and
  negative proof that system-health/error-audit counters are untouched.

`Ф0` implementation may begin immediately in an isolated worktree. TEST/production activation, real telemetry window
and `Ф1` owner live acceptance remain explicit later gates.

### Ф0 repository status — closed 2026-07-21 (`#936`)

Интеграционные коммиты `542b63815`, `82779e279`, `dcf397370` закрывают dormant default-false global flag,
shared-entry SSR fallback/classic watchdog, bounded minimized ingress, purpose-separated IP pseudonymization и
capacity-safe bounded rate-limit cleanup. Терминальный полный re-audit после двух correction-pass вернул
`PASS, P0/P1/P2 = 0/0/0`; интеграционный набор затронутых тестов и typecheck зелёный. Попытка test-globalSetup
применить миграцию `0224` к рабочей DEV-базе была fail-closed по правам (`42501`) и не является DB evidence.

Флаг остаётся выключен; migration apply, TEST/production activation, реальное telemetry window и Ф1 live acceptance
не выполнялись и требуют отдельного разрешения владельца. Ф1 остаётся открытым именно как TEST/live gate, даже
несмотря на уже интегрированный SSR/UI foundation.

## Риски / верификация

- Watchdog ES5-safe и без зависимостей (тест: принудительный фейл загрузки модуля).
- False positive: в `production` здоровый клиент отменяет watchdog ранним `ok()`, а `WATCHDOG_MS` покрывает обычный
  старт. В `development` timeout-классификация не вооружается: неограниченное ожидание компилятора нельзя отличить
  от no-module только по прошедшему времени. Это не ослабляет production fallback и не требует нового env-флага.
- Заглушка рендерится из SSR-HTML при нуле JS (кейс мёртвого движка); JS-уточнение — best-effort (кейс места).
- Приватность: payload минимизирован, но UA/correlation относятся к потенциальным персональным/идентифицирующим
  данным до явной классификации; retention/persistence проходят PR-00 + `LOG-01` gate, raw account ids запрещены.
- Всё за фиче-флагом; приёмка владельца в середине (после Ф0 телеметрии и после Ф1 живьём), «audit PASS» ≠ «готово».

## Решения владельца (закрыто 2026-07-21)

1. **Матрица минимума** — мой вызов; baseline для всех НЕ понижаем (см. Компонент 2). Стартовые значения там же, уточняются в Ф0.
2. **Уведомления** — НЕ нужны (не проблема системы). Компонент 4 отменён.
3. **Текст заглушки** — рыба владельца принята (см. «Текст заглушки»), финальная причёска на Ф1.
   Открытых развилок нет — можно стартовать с Ф0.
