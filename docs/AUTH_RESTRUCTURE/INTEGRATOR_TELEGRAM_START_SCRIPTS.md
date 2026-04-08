# Integrator: сценарии Telegram, связанные с `/start` и контактом

Выбор сценария: [`resolveBusinessScript`](../../apps/integrator/src/kernel/orchestrator/resolver.ts) — для каждого события выбирается один скрипт с максимальным `priority * 1e6 + specificity`.

Контекст `linkedPhone` задаётся в [`handleIncomingEvent`](../../apps/integrator/src/kernel/domain/handleIncomingEvent.ts) (есть нормализованный телефон у пользователя по identity → `true`).

## Основные id в `scripts.json`

| id | Условие (кратко) | Примечание |
|----|------------------|------------|
| `telegram.start.link` | `action: start.link` | Завершение channel link, не «голый» /start |
| `telegram.start.setphone` | `action: start.setphone` | Привязка телефона из payload |
| `telegram.start.setrubitimerecord` | `action: start.setrubitimerecord` | Deep link Rubitime |
| `telegram.start.noticeme` | `action: start.noticeme` | В т.ч. запрос контакта |
| `telegram.start.onboarding` | `text: /start`, `linkedPhone: false`, priority 15 | Приветствие + `request_contact` |
| `telegram.start` | `text: /start`, `linkedPhone: true`, priority по умолчанию 0 | Меню (`telegram:welcome`) |

### Аудит конфликтов для «голого» `/start`

- Сценарии с **payload** (`/start link_…`, `/start setphone`, и т.д.) в webhook маппятся на отдельные `input.action` (`start.link`, `start.setphone`, …), а не на `text: /start` — с **`telegram.start.onboarding`** они **не конкурируют** (другой матч).
- Для одного события с **ровно** текстом `/start` и `linkedPhone: false` побеждает **`telegram.start.onboarding`** (priority **15**) над **`telegram.start`** (без priority → 0), если бы оба матчились; на практике они разведены по `linkedPhone`.

Связка контакта после шаринга: `telegram.contact.link.confirm` (состояние `await_contact:subscription`, `phonePresent: true`) → `user.phone.link` → при наличии `userId` в identity — событие `contact.linked` в webapp ([`writePort`](../../apps/integrator/src/infra/db/writePort.ts)).

## Тесты оркестратора

Регресс выбора сценария: [`buildPlan.test.ts`](../../apps/integrator/src/kernel/orchestrator/buildPlan.test.ts):

- `selects telegram.start.onboarding for /start when linkedPhone is false`
- `selects telegram.contact.link.confirm when contact shared in await_contact subscription` (цепочка после onboarding: контакт → `user.phone.link` → меню)

Проекция `contact.linked` в webapp покрыта в [`events.test.ts`](../../apps/webapp/src/modules/integrator/events.test.ts) на стороне webapp; постановка события в очередь при `user.phone.link` — в [`writePort`](../../apps/integrator/src/infra/db/writePort.ts).

## Legacy

[`handleUpdate`](../../apps/integrator/src/kernel/domain/usecases/handleUpdate.ts) / [`handleMessage`](../../apps/integrator/src/kernel/domain/usecases/handleMessage.ts) **не** вызываются из [`processAcceptedIncomingEvent`](../../apps/integrator/src/kernel/domain/usecases/processAcceptedIncomingEvent.ts); менять поведение бота нужно в `scripts.json` и шаблонах.
