---
name: Публичный лендинг — заголовок и meta из настроек
overview: "Черновик, не сейчас. Канон-карточка: docs/TODO_NOT_NOW/public_landing_metadata.md. Вынести title и meta description для `/` из хардкода в system_settings (global), редактирование врачом/админом, SSR через generateMetadata."
status: draft
todos:
  - id: allow-key-and-shape
    content: "ALLOWED_KEYS + тип/парсер значения (Zod): один ключ, например `public_landing_document_meta`, JSON `{ documentTitle, metaDescription }`; лимиты длины, trim, без HTML"
    status: cancelled
  - id: doctor-patch-get
    content: "Расширить `apps/webapp/src/app/api/doctor/settings/route.ts`: DOCTOR_SCOPE_KEYS + GET отдаёт новую строку; PATCH только для этого ключа с `updateSetting(..., \"global\", ...)` (явный allowlist глобальных ключей, редактируемых врачом — не общий bypass)"
    status: cancelled
  - id: admin-patch-get
    content: "Добавить ключ в `ADMIN_SCOPE_KEYS` и нормализацию PATCH в `admin/settings/route.ts` (как у строковых/JSON настроек); GET списка админки — включить ключ в выборку, если список явный"
    status: cancelled
  - id: landing-metadata-ssr
    content: "`apps/webapp/src/app/page.tsx`: `generateMetadata()` — чтение через `buildAppDeps().systemSettings.getSetting(key, \"global\")`, fallback на текущие дефолтные строки если строки нет/битая"
    status: cancelled
  - id: settings-ui
    content: "`SettingsForm.tsx` (+ props из `settings/page.tsx`): блок «Публичный лендинг /» — два поля (заголовок документа, meta description), краткие подсказки про iOS/PWA и manifest; сохранение через PATCH doctor settings; `displayLabel`/подписи по правилам select при необходимости"
    status: cancelled
  - id: optional-apple-manifest
    content: "Опционально (отдельный подпункт DoD или фаза 2): согласовать `appleWebApp`/короткий заголовок в `layout.tsx` и поля `manifest.ts` с теми же строками — только после продуктового решения"
    status: cancelled
  - id: migration-seed
    content: "Drizzle-миграция: опциональный seed `INSERT ... ON CONFLICT` для `global` + дефолтные значения = текущий хардкод (чтобы стенд сразу имел строки); либо только fallback в коде без seed — зафиксировать в плане при исполнении"
    status: cancelled
  - id: tests-docs
    content: "`doctor/settings/route.test.ts` — PATCH/GET для нового ключа; короткий тест или контракт на `generateMetadata` при моке deps при наличии паттерна; `docs/PWA_INITIATIVE/LOG.md` или PHASE_01 — одна запись о источнике title/description"
    status: cancelled
isProject: false
---

# План: заголовок и meta лендинга `/` — `system_settings` + настройки врача

> **Черновик (не сейчас).** Реестр отложенных работ: [`docs/TODO_NOT_NOW/public_landing_metadata.md`](../../../docs/TODO_NOT_NOW/public_landing_metadata.md). Исполнение не начато; при старте — вернуть `status: pending` в frontmatter и актуализировать `todos`.

## Контекст (факты из кода)

- Сейчас **`metadata.title`** и **`metadata.description`** для **`/`** заданы в [`apps/webapp/src/app/page.tsx`](apps/webapp/src/app/page.tsx); iOS «Поделиться → На экран Домой» опирается на **`<title>`**, а не на `manifest.description`.
- Врач уже редактирует ограниченный набор через [`PATCH /api/doctor/settings`](apps/webapp/src/app/api/doctor/settings/route.ts) — whitelist **`DOCTOR_SCOPE_KEYS`** (`patient_label`, `sms_fallback_enabled`); UI — [`SettingsForm.tsx`](apps/webapp/src/app/app/settings/SettingsForm.tsx).
- Админка — отдельно [`PATCH /api/admin/settings`](apps/webapp/src/app/api/admin/settings/route.ts) и **`ADMIN_SCOPE_KEYS`**.
- Интеграция с БД: новые ключи только через канон **`updateSetting`** и зеркало integrator — см. [`.cursor/rules/system-settings-integrator-mirror.mdc`](../../.cursor/rules/system-settings-integrator-mirror.mdc).

## Продуктовое решение

- Один объект настроек для **публичного** лендинга: **заголовок HTML-документа** (`<title>`) и **meta description** (для сниппета / части соц. превью).
- Хранение: **`system_settings`**, scope **`global`** (страница `/` без сессии должна читать одно согласованное значение на весь деплой).
- Запись: **врач** и **админ** могут менять (врач — UX «настройки кабинета»; админ — дублирующий блок в админ-вкладках или тот же карточный блок, если админ открывает `/app/settings` с тем же `SettingsForm` — уточнить при исполнении: достаточно doctor PATCH + admin PATCH без дублирования UI).

## Scope (разрешено / запрещено)

**Разрешено трогать**

- `apps/webapp/src/modules/system-settings/types.ts`
- `apps/webapp/src/app/api/doctor/settings/route.ts` (+ тест)
- `apps/webapp/src/app/api/admin/settings/route.ts` (+ нормализация в `adminSettingsPatchNormalize.ts` при необходимости)
- `apps/webapp/src/app/page.tsx`, `apps/webapp/src/app/app/settings/page.tsx`, `apps/webapp/src/app/app/settings/SettingsForm.tsx`
- Drizzle миграция webapp при выборе варианта «seed в БД»
- `docs/PWA_INITIATIVE/*` — короткая запись о поведении title/description

**Вне scope (не делать в этом плане без расширения)**

- Полный CMS-текст **`MarketingHomeLanding`** (h1, буллеты, «Обо мне») — только **meta-уровень** документа `/`.
- Смена **`manifest.ts`** `name`/`short_name`/`description` — опциональный подпункт todo `optional-apple-manifest`; по умолчанию не трогать.
- Новые **env** для этих строк — запрещено каноном конфигурации.

## Шаги исполнения (с проверками)

### 1. Ключ и контракт значения

- [ ] Добавить в **`ALLOWED_KEYS`** один ключ (имя зафиксировать в PR, напр. `public_landing_document_meta`).
- [ ] Значение: `value_json` в форме **`{ value: { documentTitle: string; metaDescription: string } }`** как у других настроек.
- [ ] Zod-схема + лимиты (напр. title ≤ 120 символов, description ≤ 320), `trim`, отклонение/очистка управляющих символов.
- [ ] Проверка: `rg` по репо на ключ; `pnpm --filter @bersoncare/webapp typecheck`.

### 2. Запись: врач

- [ ] Расширить **`DOCTOR_SCOPE_KEYS`** новым ключом.
- [ ] В **`PATCH`**: после проверки роли вызывать **`updateSetting(key, "global", normalized, userId)`** только для этого ключа (явная ветка / маленький Set `DOCTOR_PATCHABLE_GLOBAL_KEYS`, не общий обход scope).
- [ ] **`GET`**: включить чтение значения для отображения в форме (из `listSettingsByScope("global")` или точечный `getSetting` — выбрать один способ, без N+1 в цикле).
- [ ] Проверка: расширить [`route.test.ts`](apps/webapp/src/app/api/doctor/settings/route.test.ts) — 200 и тело ответа.

### 3. Запись: админ

- [ ] Добавить ключ в **`ADMIN_SCOPE_KEYS`** и обработку в **`normalizeValueJson`** / отдельный нормализатор (по аналогии с `notifications_topics` или проще).
- [ ] Проверка: существующие тесты `admin/settings/route.test.ts` или точечный новый кейс.

### 4. SSR лендинга

- [ ] Перевести [`page.tsx`](apps/webapp/src/app/page.tsx) на **`export async function generateMetadata()`**: `buildAppDeps()`, `getSetting`, fallback на текущие строки.
- [ ] Убрать статический `export const metadata`, если он конфликтует с `generateMetadata` (Next: один источник).
- [ ] Проверка: smoke inprocess при наличии прогрева `homeRoot` или тонкий unit на парсер без холодного импорта страницы — по политике тестов репозитория.

### 5. UI врача

- [ ] Прокинуть начальные значения из **`settings/page.tsx`** (сервер уже грузит deps) в **`SettingsForm`**.
- [ ] Добавить два поля ввода + сохранение (один PATCH с объектом **или** два последовательных PATCH — предпочтительно **один** ключ-объект одним запросом, если API позволит; иначе один PATCH с полным JSON объекта).
- [ ] Копирайт UI: лаконично, без длинных пояснений (правило проекта); одна строка-hint про iOS/PWA при необходимости.

### 6. Миграция / seed

- [ ] Решение при исполнении: **только fallback в коде** vs **миграция с INSERT**. Если миграция — дублировать строку в **`integrator.system_settings`** в том же файле миграции по канону зеркала.

### 7. Документация

- [ ] `docs/PWA_INITIATIVE/LOG.md` или `PHASE_01_ROOT_LANDING.md` — где брать title/description после выката.

## Definition of Done

1. **`/`** отдаёт `<title>` и meta description из **`system_settings`** при наличии валидной строки; иначе — прежние дефолты.
2. Врач сохраняет значения с **`/app/settings`** без ошибок 403/400; админ может править тот же ключ через админский PATCH.
3. Ключ в **`ALLOWED_KEYS`**; запись только через **`updateSetting`**; интегратор-зеркало не нарушено.
4. **Нет новых env** для текстов.
5. Тесты API + типизация зелёные; в конце объёма — `pnpm --filter @bersoncare/webapp lint` и целевой прогон тестов затронутых файлов.

## Риски и вопросы на исполнение

- **Кэш** `configAdapter` / TTL для `getSetting` после PATCH — убедиться, что лендинг не отдаёт устаревший title дольше допустимого (при необходимости `invalidateConfigKey` уже вызывается из admin route — проверить цепочку для doctor PATCH).
- **Два редактора** (врач и админ): последний сохранивший побеждает — приемлемо для single-tenant; иначе ввести аудит в backlog.
