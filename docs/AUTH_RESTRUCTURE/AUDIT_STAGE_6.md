# AUDIT — Stage 6 (бот: onboarding, `request_contact`, проекция номера)

**Scope:** `STAGE_6_BOT_REQUEST_CONTACT_AND_ONBOARDING.md`, `MASTER_PLAN.md` → Stage 6.

**Дата аудита:** 2026-04-04

---

## Verdict

**PASS**

---

## Проверки (gate)

### 1) Канонический текст и эмодзи (👋 ✅ ❗)

**Статус:** OK

**Telegram** — шаблон `onboardingWelcome` в `apps/integrator/src/content/telegram/user/templates.json`:

- После «Привет!» используется **👋** (не литерал `(!)`).
- Блок «Еще тут можно:» — пункты с **✅** (шесть строк), как в S6.T06.
- Абзац про обязательность номера начинается с **❗**.
- Текст основного блока совпадает с каноном `STAGE_6_BOT_REQUEST_CONTACT_AND_ONBOARDING.md` (S6.T06), включая формулировку про платформы и «приложение».

**Max** — `max:onboardingWelcome` в `apps/integrator/src/content/max/user/templates.json`:

- Тот же канонический блок 👋 / ✅ / ❗.
- Дополнительно, в конце (после абзаца про браузер и приложение), задокументированный fallback: абзац с **📎** и инструкцией отправить вложение «Контакт» (ограничение API Max, см. stage-док).

**Прочее:** в `content` нет литералов `\(!\)` вместо эмодзи для onboarding.

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
- Сценарии: `telegram.start` и `max.start` с `context: { "linkedPhone": true }` — welcome + меню, **без** `telegram.start.onboarding` / `max.start.onboarding`.
- **Тесты:** `buildPlan.test.ts` — выбор `telegram.start` при `linkedPhone: true` вместо onboarding; аналогично Max. `handleUpdate.test.ts` — при `hasLinkedPhone: true` на `/start` не отправляется onboarding.

---

### 4) Проекция номера в webapp

**Статус:** OK

- Integrator: при мутации `user.phone.link` в `writePort.ts` в очередь проекций кладётся событие **`contact.linked`** с `payload: { integratorUserId, phoneNormalized }` (при известном `userId`).
- Webapp: `apps/webapp/src/modules/integrator/events.ts` обрабатывает `contact.linked` — `upsertFromProjection` и `updatePhone` для `platform_users`.
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

- Шаблон **`telegram:welcome`** (не onboarding) использует **👋🏻** в приветствии — это другой экран (`/start` уже с привязанным номером); на канон S6.T06 для первичного onboarding не влияет.
- **Max:** первый `/start` без номера — одно текстовое сообщение без inline/reply-кнопки «контакт»; ожидаемое ограничение платформы, отражено в тексте с 📎.

---

## MANDATORY FIX INSTRUCTIONS

**Обязательных исправлений по результатам этого аудита нет** (нет `critical` / `major`).
