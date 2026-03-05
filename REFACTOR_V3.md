
# REFACTOR PLAN — ARCHITECTURE V3 REAL CLEAN

Ветка: `ARCHITECTURE-V3-REAL-CLEAN`

Цель: привести систему к архитектуре V3 с чёткими слоями и изоляцией ответственности.

---

# ГЛОБАЛЬНЫЕ ПРАВИЛА

## 1. НЕ РЕДАКТИРОВАТЬ MD ФАЙЛЫ

Нельзя изменять любые `.md` файлы, которые уже существуют в проекте.

Каждый слой имеет свой файл:

src//.md

Эти файлы являются **архитектурной спецификацией слоя**.

Перед работой со слоем **обязательно прочитать соответствующий MD файл**.

После изменений слой должен **полностью соответствовать его описанию**.

MD файлы **только читаются**, но **никогда не редактируются**.

---

## 2. ФАЙЛ ОТМЕТОК ШАГОВ

Создать файл:

REFACTOR_STEPS_DONE.md

После выполнения каждого шага добавить строку:

STEP <номер> DONE

Пример:

STEP 5 DONE

Никакие другие MD файлы не изменяются.

---

## 3. НИКОГДА НЕ УДАЛЯТЬ СТАРЫЙ КОД ДО ПОЯВЛЕНИЯ НОВОГО

Стратегия миграции:

1 создать новый слой
2 перенести ответственность
3 реализовать новую функцию
4 написать тест
5 переключить вызов
6 удалить старый код

---

## 4. ПЕРЕНОСИМ НЕ КОД, А ОТВЕТСТВЕННОСТЬ

Если найден код не в своём слое — **его нельзя просто копировать**.

Нужно:

понять ответственность
реализовать её в правильном слое
использовать старый код только как reference

Допускается копировать только:

контракты
типы
утилиты
маппинг payload

---

## 5. ОРКЕСТРАТОР МОЖЕТ ВРЕМЕННО СОДЕРЖАТЬ СТАРЫЕ IF-ELSE

Текущая система сценариев может быть временно перенесена в orchestrator.

Это допустимо.

Цель первого этапа:

вынести сценарии из других слоёв

Позже orchestrator будет переписан на JSON scripts.

Но **остальные слои уже не должны зависеть от того, как устроены сценарии**.

---

## 6. ВСЕ ТЕСТЫ ДОЛЖНЫ РАБОТАТЬ

После каждого шага запускать:

pnpm typecheck
pnpm test

Если тесты падают — шаг не выполнен.

---

# ЦЕЛЕВАЯ АРХИТЕКТУРА

integration
↓
eventGateway
↓
domain.handleIncomingEvent
↓
orchestrator.resolveScript
↓
domain.executeAction
↓
runtime
↓
dispatcher
↓
integration.send

---

# ШАГ 0 — СОЗДАТЬ ВЕТКУ

git checkout -b ARCHITECTURE-V3-REAL-CLEAN
git push -u origin ARCHITECTURE-V3-REAL-CLEAN

Создать файл:

REFACTOR_STEPS_DONE.md

---

# ШАГ 1 — ПОДГОТОВИТЕЛЬНАЯ МАРКИРОВКА КОДА

Задача: понять что куда переносится.

Изменения поведения запрещены.

Если найдено:

### SQL в integration

добавить комментарий:

ARCH-V3 MOVE
этот код должен быть перенесён в domain executor

---

### логика сценариев

ARCH-V3 MOVE
этот код должен быть перенесён в orchestrator

---

### dedup / rate-limit

ARCH-V3 MOVE
этот код должен быть перенесён в eventGateway

---

Этот шаг **ничего не ломает**.

---

# ШАГ 2 — СОЗДАТЬ CONTRACTS

Создать папку:

src/kernel/contracts

Добавить типы:

IncomingEvent
GatewayResult
DomainContext
ScriptStep
Action
ActionResult
OutgoingIntent
DeliveryJob

Добавить тесты схем.

---

# ШАГ 3 — СОЗДАТЬ EVENT GATEWAY

Создать:

src/kernel/eventGateway

Gateway выполняет только:

валидация envelope
dedup
rate-limit
аудит

Gateway **не делает**:

бизнес решений
SQL
вызова orchestrator
вызова domain

Gateway возвращает:

GatewayResult

---

# ШАГ 4 — DOMAIN EXECUTOR

Создать:

src/kernel/domain/executor

Основной файл:

executeAction.ts

Executor принимает:

Action
DomainContext

Executor вызывает через порты:

DB
queue
template

Добавить handlers:

booking.upsert
booking.event.insert
message.compose
intent.enqueueDelivery
user.findByPhone
log.audit

---

# ШАГ 5 — DOMAIN HANDLE EVENT

Создать:

src/kernel/domain/handleIncomingEvent.ts

Алгоритм:

event
↓
load context
↓
orchestrator.resolveScript
↓
получить ScriptSteps
↓
executeAction
↓
получить intents/jobs

Domain **не отправляет сообщения напрямую**.

---

# ШАГ 6 — СОЗДАТЬ ORCHESTRATOR

Создать:

src/kernel/orchestrator

Файл:

resolveScript.ts

Он получает:

IncomingEvent
DomainContext

Возвращает:

ScriptStep[]

На первом этапе допустимо:

перенести старые if-else сценарии

Но **только внутри orchestrator**.

---

# ШАГ 7 — CONTENT REGISTRY

Создать:

src/kernel/contentRegistry

Загрузка:

src/content//scripts.json
src/content//templates.json

---

# ШАГ 8 — RUNTIME

Создать структуру:

src/runtime



runtime/
worker/
worker.ts
jobExecutor.ts
retryPolicy.ts

scheduler/
scheduler.ts

dispatcher/
dispatcher.ts

---

# worker

job
↓
jobExecutor
↓
result
↓
retryPolicy
↓
queue schedule

---

# dispatcher

intent → integration adapter

Dispatcher **не содержит бизнес логики**.

---

# ШАГ 9 — ПЕРЕВЕСТИ RUBITIME

Pipeline:

rubitime webhook
↓
IncomingEvent
↓
eventGateway
↓
domain
↓
orchestrator
↓
runtime

---

# ШАГ 10 — ПЕРЕВЕСТИ TELEGRAM

Та же схема.

---

# ШАГ 11 — RETRY JOBS

Worker выполняет:

delivery retry
scheduled jobs

---

# ШАГ 12 — IFRAME RUBITIME

Iframe должен работать через pipeline.

---

# ШАГ 13 — УДАЛЕНИЕ LEGACY

Удалить:

SQL из integrations
бизнес логику из integrations
sendMessage из integrations

---

# ШАГ 14 — ФИНАЛЬНАЯ ПРОВЕРКА

Запустить:

pnpm typecheck
pnpm test
pnpm build

---

# ГОТОВНОСТЬ

Архитектура считается реализованной если:

integration
→ gateway
→ domain
→ orchestrator
→ domain executor
→ runtime
→ dispatcher
→ integration

Каждый слой выполняет **только свою ответственность**.



# КРИТИЧЕСКИЕ ЗАПРЕТЫ АРХИТЕКТУРЫ

AI агент не имеет права нарушать следующие правила.

## 1 Domain не содержит сценариев

Domain не может содержать:

if(event.type)
if(channel)
if(bookingCreated)

Domain выполняет только:

executeAction(action)

Все сценарии находятся только в orchestrator.

---

## 2 Integrations не содержат бизнес логики

Integration может:

map payload
validate request
send message

Integration не может:

делать fallback
переключать каналы
делать retry
принимать решения

---

## 3 Runtime не содержит бизнес логики

Runtime может:

выполнить job
повторить job
запланировать job

Runtime не может:

менять сценарий
переключать канал
делать fallback