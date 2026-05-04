# Platform Context Mechanism — Отчёт о реализации

Дата: 2026-03-28  
Статус: **реализовано**, CI зелёный (кроме pre-existing audit)

---

## Что сделано

### Фаза 1: Инфраструктура механизма

Внедрён механизм определения платформы (`bot` | `mobile` | `desktop`) для webapp. Работает и на сервере (SSR), и на клиенте без flash-эффекта при гидрации.

**Новые файлы:**

| Файл | Назначение |
|------|------------|
| `src/shared/lib/platform.ts` | Типы `PlatformEntry`, `PlatformMode`, константы cookie, `serializePlatformBotCookie()` |
| `src/shared/lib/platformCookie.server.ts` | Серверный хелпер `getPlatformEntry()` — чтение cookie в Server Components |
| `src/shared/ui/PlatformProvider.tsx` | Клиентский React context: `serverHint` + Mini App fallback + viewport `matchMedia` |
| `src/shared/hooks/usePlatform.ts` | Хук `usePlatform()` — возвращает `PlatformMode` |
| `src/middleware.ts` + `src/middleware/platformContext.ts` | Next.js middleware: `?ctx=bot` → cookie + redirect |
| `src/app-layer/routes/navigation.ts` | Декларативные конфиги навигации и блоков главной по платформе |
| `src/shared/lib/platform.md` | Документация механизма |

**Изменённые файлы:**

| Файл | Что изменено |
|------|-------------|
| `src/app/layout.tsx` | Async root layout, `getPlatformEntry()`, `<PlatformProvider>` вокруг children |

**Тесты:** `src/middleware.test.ts` (4 теста), `src/app-layer/routes/navigation.test.ts` (7 тестов)

### Фаза 2: Подключение к UI

Механизм подключён к трём ключевым компонентам:

**PatientHeader.tsx** — полностью переписана правая часть шапки:
- Хардкод иконок заменён на `usePlatform()` + `patientNavByPlatform[platform]`
- Иконки рендерятся из конфига через `renderHeaderIcon()` по массиву `headerRightIcons`
- Sheet-меню рендерится только при `hasSheetMenu === true`
- Logout и «Установить приложение» контролируются через `showLogout` / `showInstallPrompt`
- В бот-режиме: справка (CircleHelp) → настройки (Settings), без Sheet, без logout
- В mobile/desktop: сообщения → напоминания → гамбургер + полное Sheet-меню

**patient/page.tsx** — секции главной фильтруются через `Set<HomeBlockId>`:
- В бот-режиме: только materials, assistant, purchases, lfk-complexes, patient-card
- В mobile/desktop: все блоки
- Пропущенные блоки не загружают данные (оптимизация серверных запросов)

**AskQuestionFAB.tsx** — упрощён:
- Вместо `isMessengerMiniAppHost()` + `useEffect` + `useState` → `usePlatform() === "bot"` → `return null`
- Убрана вся логика opacity/invisible/transition (бот — просто не рендерится)

---

## Модель платформы

```
Entry (cookie)        Viewport (client)     Итог (PlatformMode)
─────────────         ─────────────────     ───────────────────
bot              →                          bot
standalone       →    < 768px               mobile
standalone       →    ≥ 768px               desktop
```

**Как попадает cookie:**

1. Reply keyboard бота открывает URL с `?ctx=bot` → middleware ставит cookie и редиректит
2. Mini App без `?ctx` → PlatformProvider детектит `isMessengerMiniAppHost()`, пишет cookie через `document.cookie`
3. Браузер/PWA → cookie не ставится, `standalone` по умолчанию

**Cookie:** `bersoncare_platform=bot`, 24h, `SameSite=None; Secure` в production (iframe Mini App).

---

## Конфиги навигации (текущие)

### Шапка пациента (headerRightIcons)

| Платформа | Иконки справа |
|-----------|--------------|
| bot | Справка (?) → Настройки (⚙) |
| mobile | Сообщения → Напоминания → Меню (☰) |
| desktop | Сообщения → Напоминания → Меню (☰) |

### Блоки главной (patientHomeBlocksByPlatform)

| Платформа | Блоки |
|-----------|-------|
| bot | materials, assistant, purchases*, lfk-complexes*, patient-card* |
| mobile | cabinet, materials, purchases*, lfk-complexes*, patient-card*, news, mailings, motivation, stats, channels |
| desktop | (= mobile) |

\* — purchases, lfk-complexes, patient-card: ID заведены в конфиге, но компоненты для них ещё не существуют на главной. Рендер появится когда будут готовы соответствующие секции.

---

## Что дальше

### Ближайшие задачи (подключение страниц)

1. **Верстка главной в бот-режиме** — *исторический снимок:* `materials` / `assistant` и компонент **`PatientHomeLessonsSection`** (на 2026-05-04 **удалён** из репозитория; каталог контента — `/app/patient/sections`). Нужно:
   - Создать компонент «Помощник» (управление напоминаниями о разминках) → `PatientHomeAssistantSection`
   - При необходимости отдельного блока «уроки» на главной — новый компонент, согласованный с текущей главной (`PatientHomeToday` и т.д.)

2. **Секция `purchases` на главной** — показывается только при наличии покупок. Нужен компонент `PatientHomePurchasesSection` (или условный рендер существующего)

3. **Секция `lfk-complexes` на главной** — назначенные комплексы ЛФК. Компонент пока отсутствует

4. **Секция `patient-card`** — карта пациента (этап 17 по ROADMAP). Заглушка или заведение по мере готовности

5. **Мобильный вид — блок ближайших записей** (`appointments`) сверху главной. В конфиге ID есть, нужен компонент + данные из appointments модуля

6. **Мобильный вид — кнопка записи в правом меню** (Sheet). Сейчас записи в `PatientHomeCabinetSection`, в правом меню нет. Добавить пункт

### По ROADMAP

Текущая работа по platform context — это **дополнение к этапам 2 (дизайн-система) и 4 (главная и записи)**. Механизм готов; дальнейшие изменения — в рамках перечисленных задач выше и по ROADMAP:

- **Этап 15 (PWA)** — `showInstallPrompt` в конфиге уже учитывает десктоп vs мобильный
- **Этап 17 (Карта пациента)** — `patient-card` блок уже в конфиге для всех платформ
- **Desktop-layout для врача** — отдельная задача: sidebar, широкий layout с видео. Механизм `usePlatform()` уже доступен в любом клиентском компоненте

### Технические замечания

- **Next.js 16 middleware deprecation**: при build есть warning что `middleware` deprecated в пользу `proxy`. Текущий код работает. При будущей миграции на proxy-конвенцию — перенести логику из `src/middleware.ts`
- **`isMessengerMiniAppHost()`** в `src/shared/lib/messengerMiniApp.ts` остаётся — используется как fallback внутри `PlatformProvider`. Прямые вызовы из UI-компонентов заменены на `usePlatform()`
- **`pnpm audit --prod`** падает на pre-existing уязвимостях в транзитивных зависимостях (`brace-expansion` в `shadcn`, `nodemailer`, `path-to-regexp` в `shadcn`) — не связано с platform context
