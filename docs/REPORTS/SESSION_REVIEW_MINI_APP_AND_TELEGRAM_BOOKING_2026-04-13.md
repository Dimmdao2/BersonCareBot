# Отчёт проверки правок (Mini App / Telegram запись) — 2026-04-13

## Область ревью

- **Webapp:** единый UI запроса контакта в мини-приложении, скрытие внутренней шапки пациента на время гейта и на `/bind-phone`.
- **Integrator:** навигация «Назад» в inline-цепочке записи на приём без выхода на устаревший `menu.main`.
- **Архитектура:** зависимости слоёв и документация.

## Найденные проблемы и исправления

### 1. Нарушение направления зависимостей (исправлено)

**Проблема:** `shared/ui` импортировал `@/app/app/patient/PatientPhonePromptChromeContext` — общий UI зависел от маршрутного слоя приложения.

**Исправление:** контекст перенесён в [`apps/webapp/src/shared/ui/patient/PatientPhonePromptChromeContext.tsx`](../apps/webapp/src/shared/ui/patient/PatientPhonePromptChromeContext.tsx); импорты обновлены в `PatientClientLayout`, `PatientGatedHeader`, `MiniAppShareContactGate`, `PatientBindPhoneClient`.

### 2. Поведение Telegram «Назад» в записи (исправлено ранее в сессии)

**Проблема:** `menu.back` подставлял `menu.main`; возврат с «Как подготовиться» через `bookings.show` терял текст виджета Rubitime.

**Исправление:** callback **`booking.menu`**, сценарий **`telegram.booking.menu`**, замены в `scripts.json` — см. [`AUTH_RESTRUCTURE/TELEGRAM_BOOKING_INLINE_NAV.md`](../AUTH_RESTRUCTURE/TELEGRAM_BOOKING_INLINE_NAV.md).

### 3. Риски без изменения кода (зафиксировано)

- **Двойной writer `suppressPatientHeader`:** и `MiniAppShareContactGate`, и `PatientBindPhoneClient` вызывают `setSuppressPatientHeader`; при смене маршрута снимают флаг в `cleanup`. На типичных переходах коллизий нет; при появлении артефактов стоит свести к одному источнику истины.
- **Max:** сценарий `booking.menu` только в Telegram; Max-контент не синхронизировался.

## Документация

- Обновлён [`AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md`](../AUTH_RESTRUCTURE/BOT_CONTACT_MINI_APP_GATE.md) (шапка, пути к файлам, ссылка на запись).
- Добавлен [`AUTH_RESTRUCTURE/TELEGRAM_BOOKING_INLINE_NAV.md`](../AUTH_RESTRUCTURE/TELEGRAM_BOOKING_INLINE_NAV.md).
- В [`docs/README.md`](../README.md) добавлена строка в блок AUTH.

## Проверки

Перед пушем: `pnpm install --frozen-lockfile && pnpm run ci` (как в `.cursor/rules/pre-push-ci.mdc`).

---

## Повторный аудит (follow-up)

### Исправлено: гонка suppress шапки на `/bind-phone`

**Симптом:** в Mini App на странице привязки телефона внутренняя шапка могла снова показываться: `MiniAppShareContactGate` при `mode === "inactive"` вызывал `setSuppressPatientHeader(false)` в `useEffect`, который в дереве React выполняется **после** эффекта дочернего `PatientBindPhoneClient`, перезаписывая `true`.

**Исправление:** в `MiniAppShareContactGate` при `pathname` с `/bind-phone` эффект управления suppress **не выполняется** — флаг остаётся за `PatientBindPhoneClient`.

### Зафиксировано без кода

- **`telegram.booking.menu`:** сценарий только при `linkedPhone: true`; без телефона срабатывает центральный callback-гейт в `resolver.ts` (запрос контакта).
- **`telegram.booking.menu` / `telegram.booking.open`:** два шага `message.edit` с `_when`; если задан только `webappCabinetUrl` без `webappAddressUrl` (или наоборот), оба условия могут не выполниться — тогда остаётся только `callback.answer` (редкая конфигурация фактов).
- **Max:** сценарий `booking.menu` не дублировался; inline-запись в Max при необходимости синхронизировать отдельно.
- **Оставшиеся `menu.back` в `scripts.json`:** относятся к дневнику, уведомлениям, ассистенту и т.д., не к цепочке «Запись на приём» после правки.
