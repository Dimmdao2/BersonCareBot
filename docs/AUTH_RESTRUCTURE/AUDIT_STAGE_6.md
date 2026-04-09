# AUDIT — Stage 6 (бот: onboarding, `request_contact`, проекция номера)

**Scope:** `STAGE_6_BOT_REQUEST_CONTACT_AND_ONBOARDING.md`, `MASTER_PLAN.md` → Stage 6.

**Дата аудита:** 2026-04-04

---

## Verdict

**PASS**

### Актуализация продукта (2026-04-08)

После первичного аудита (2026-04-04) укорочены тексты и шаги `/start`:

- **Telegram:** `onboardingWelcome` — короткая строка про привязку номера для всех платформ + кнопка `request_contact` в одном сообщении; **`telegram.start`** при `linkedPhone: true` — только `user.state.set`, **без** отправки welcome/меню; deep link **`start.setphone`** — `startSetphoneWelcome` + reply-меню.
- **Max:** короткий `max:onboardingWelcome`; **`max.start`** при `linkedPhone: true` — только `user.state.set`; после привязки контакта — `phoneLinkedWelcome` + меню.

Источник правды по сценариям: [`INTEGRATOR_TELEGRAM_START_SCRIPTS.md`](INTEGRATOR_TELEGRAM_START_SCRIPTS.md). Разделы «Проверки (gate)» ниже отражают **логику** Stage 6; длинный канон S6.T06 с блоком ✅/❗ для onboarding **больше не совпадает** с текущими шаблонами.

---

## Проверки (gate)

### 1) Текст onboarding и запрос контакта

**Статус:** OK (актуализация 2026-04-08: короткий копирайт вместо длинного канона S6.T06 с блоком ✅/❗).

**Telegram** — `onboardingWelcome` в `apps/integrator/src/content/telegram/user/templates.json`: краткий текст про привязку номера для всех платформ + кнопка `request_contact` в одном `message.replyKeyboard.show`.

**Max** — `max:onboardingWelcome`: краткий текст + просьба отправить вложение с контактом (отдельной кнопки «поделиться контактом» в Max нет).

---

### 2) `request_contact` сразу после приветствия

**Статус:** OK (Telegram)

Сценарий `telegram.start.onboarding` (`scripts.json`): шаг `message.replyKeyboard.show` с `templateKey: "telegram:onboardingWelcome"` и кнопкой `requestPhone: true` в **одном** действии — пользователь получает полный текст приветствия и клавиатуру с запросом контакта без отдельного предшествующего сообщения.

Legacy-путь: `handleUpdate.test.ts` — при `/start` без номера одно действие `sendMessage` с текстом onboarding и `replyMarkup` с `request_contact`.

**Max:** отдельной кнопки как в Telegram нет; первый шаг — `message.send` с `max:onboardingWelcome` (канон + инструкция 📎), что соответствует заявленному workaround в stage-доке.

---

### 3) Повторный `/start` после линка номера не запускает onboarding заново

**Статус:** OK

- Контекст `linkedPhone: true` при нормализованном телефоне в БД (`handleIncomingEvent` / загрузка пользователя).
- Сценарии: `telegram.start` и `max.start` с `context: { "linkedPhone": true }` — только `user.state.set` → `idle`, **без** исходящих сообщений и **без** `telegram.start.onboarding` / `max.start.onboarding`.
- **Тесты:** `buildPlan.test.ts` — при `linkedPhone: true` планируется `user.state.set` (Telegram); onboarding для Max при `linkedPhone: false` отдельным кейсом. `handleUpdate.test.ts` — при `hasLinkedPhone: true` на `/start` не отправляется onboarding/welcome.

---

### 4) Проекция номера в webapp

**Статус:** OK

- Integrator: при мутации `user.phone.link` в `writePort.ts` в очередь проекций кладётся событие **`contact.linked`** с `payload: { integratorUserId, phoneNormalized, channelCode, externalId }` (при известном `userId`).
- Webapp: `apps/webapp/src/modules/integrator/events.ts` обрабатывает `contact.linked` через `upsertFromProjection` и `updatePhone`: обновляется не только `platform_users.phone_normalized`, но и `user_channel_bindings`, если в payload пришли `channelCode` + `externalId`.
- Инвариант для UI: после успешного `contact.linked` профиль в webapp должен быть согласован с ботом и по номеру, и по блоку «Привязанные каналы». Это закрывает сценарий, когда бот уже перестал запрашивать номер на `/start`, а ЛК всё ещё показывал Telegram как не привязанный.
- **Тесты:** `events.test.ts` — сценарии `contact.linked` (в т.ч. согласованность с `user.upserted`).

---

### 5) CI evidence

**Статус:** OK

| Команда | Результат |
|---------|-----------|
| `pnpm install --frozen-lockfile && pnpm run ci` | **exit 0** (2026-04-04) |

---

## Findings by severity

### Critical

Нет.

### Major

Нет.

### Minor / informational

- Шаблон **`telegram:welcome`** по-прежнему существует для других экранов; сценарий **`telegram.start`** при `linkedPhone: true` его **не** вызывает (нет сообщения на «голый» `/start` с привязанным номером).
- **Max:** первый `/start` без номера — одно короткое текстовое сообщение без inline/reply-кнопки «контакт»; ожидаемое ограничение платформы.

---

## MANDATORY FIX INSTRUCTIONS

**Обязательных исправлений по результатам этого аудита нет** (нет `critical` / `major`).
