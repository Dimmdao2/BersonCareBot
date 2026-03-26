# Отчет по структуре и UI-архитектуре `apps/webapp`

## 1) Общая картина

`apps/webapp` — отдельный fullstack-сервис на Next.js (App Router), который содержит:

- фронтенд-страницы (`/app`, `/app/patient/*`, `/app/doctor/*`, `/app/settings`);
- backend-слой через route handlers (`/api/*`) внутри того же приложения;
- бизнес-модули (`src/modules/*`);
- инфраструктурные адаптеры (`src/infra/*`);
- ручную сборку зависимостей (DI) в `src/app-layer/di/buildAppDeps.ts`.

Модель слоев в проекте консистентная: страницы и API-тонкие, бизнес-логика в `modules`, доступ к БД/интеграциям в `infra`.

## 2) Структура папок webapp и логика

Ключевые каталоги:

- `apps/webapp/src/app` — App Router: страницы, layout'ы, route handlers.
- `apps/webapp/src/app-layer` — composition root и guard-логика:
  - `di/` — сборка всех портов/сервисов (`buildAppDeps`);
  - `guards/` — `requireSession`, `requireDoctorAccess`, `requirePatientAccess`;
  - `routes/` — централизованные route-константы.
- `apps/webapp/src/modules` — прикладная логика по доменам (`auth`, `diaries`, `doctor-*`, `lessons`, `emergency`, `content-catalog`, и т.д.).
- `apps/webapp/src/infra` — Postgres-репозитории, интеграционные адаптеры, DB-клиент, in-memory адаптеры.
- `apps/webapp/src/shared` — общие типы/утилиты и UI-компоненты (`shared/ui`).
- `apps/webapp/src/config` — env-конфиг и валидация (`zod`).
- `apps/webapp/scripts` — миграции/backfill/reconcile/seed-скрипты.

Практически это монолит внутри одного Next-сервиса, но с четкой границей слоев.

## 3) Какие библиотеки используются

По `apps/webapp/package.json`:

Основные runtime-зависимости:

- `next` (App Router, route handlers, SSR/RSC),
- `react`, `react-dom`,
- `pg` (PostgreSQL),
- `zod` (валидация env и входных данных),
- `dotenv`.

Dev tooling:

- `typescript`,
- `eslint`, `eslint-config-next`,
- `vitest`,
- `@types/*`.

Что **не используется** в базе UI:

- нет `Radix UI`,
- нет `MUI`, `Ant`, `Chakra`,
- нет `Tailwind`,
- нет styled-components/emotion.

Итого: UI — в основном собственные компоненты + собственный CSS.

## 4) Подробно: как хранятся страницы

Здесь два разных смысла "страниц":

### 4.1. Страницы приложения (маршруты Next.js)

Хранятся в файловой структуре `src/app/**/page.tsx`:

- `src/app/page.tsx` -> редирект на `/app`;
- `src/app/app/page.tsx` -> entry/login;
- `src/app/app/patient/*` -> пациентские экраны;
- `src/app/app/doctor/*` -> врачебные экраны;
- `src/app/app/settings/page.tsx`.

Layout'ы:

- `src/app/layout.tsx` — корневой layout (подключает `globals.css`, Telegram WebApp script);
- `src/app/app/doctor/layout.tsx` — layout секции врача (добавляет `DoctorNavigation`).

### 4.2. Контентные страницы (уроки/экстренные материалы)

Это уже не Next-route файлы, а записи контента:

- таблица БД `content_pages`,
- доступ через порт `createPgContentPagesPort()` (`src/infra/repos/pgContentPages.ts`),
- чтение в `content-catalog`, `lessons`, `emergency`,
- редактирование из doctor-кабинета (`/app/doctor/content`) через server action.

Поток:

1. Врач редактирует/создает страницу (`/app/doctor/content/new`, `/edit/[id]`).
2. `saveContentPage` делает `upsert` в `content_pages`.
3. Вызывается `revalidatePath(...)`.
4. Пациентские `/app/patient/lessons`, `/app/patient/emergency`, `/app/patient/content/[slug]` читают актуальные данные.

Fallback-логика:

- если БД недоступна или пусто, сервисы возвращают hardcoded stub-контент (`modules/lessons/service.ts`, `modules/emergency/service.ts`, `modules/content-catalog/catalog.ts`).

## 5) Подробно: верстка, дизайн, UI-база

### 5.1. Базовый подход

В проекте один большой файл `src/app/globals.css`. CSS-модулей нет.

Это означает:

- единое место стилей и переменных;
- быстрый старт и единая визуальная система;
- но растущий размер файла и высокий риск пересечения селекторов по мере роста.

### 5.2. Как организован CSS

`globals.css` организован крупными блоками с комментариями:

- root variables (`--patient-*` tokens),
- app shell,
- patient header/drawer,
- top bar врача,
- кнопки/карточки/сетки (`.button`, `.panel`, `.feature-grid`, `.status-pill`),
- отдельные секции для doctor navigation,
- FAB "Задать вопрос" и нижняя панель.

Есть переиспользуемые базовые классы:

- layout: `.app-shell`, `.content-area`, `.stack`,
- surface: `.panel`, `.hero-card`, `.feature-card`,
- controls: `.button`, модификаторы (`--ghost`, `--danger-outline`),
- статусные элементы: `.status-pill`, `.empty-state`.

Плюс есть variant-подход:

- `.app-shell--patient` и `.app-shell--doctor` задают отличающийся визуальный режим.

### 5.3. Есть ли inline-стили

Да, встречаются `style={{ ... }}` в нескольких компонентах/страницах (таблицы, локальные отступы, контейнеры embed/video и т.д.).
То есть стиль смешанный:

- основной дизайн в `globals.css`,
- отдельные локальные правки через inline style.

### 5.4. Переиспользование компонентов и шаблонов

Переиспользование есть и заметное:

- `AppShell` — основной каркас страниц (header + content + patient/doctor variants);
- `PatientHeader`, `DoctorNavigation` — навигационные паттерны;
- `FeatureCard`, `ConnectMessengersBlock`, auth-формы (`PhoneAuthForm`, `SmsCodeForm`, `BindPhoneBlock`);
- общие route-константы (`routePaths`);
- DI (`buildAppDeps`) как единый шаблон подключения сервисов.

Глубокого design-system пакета (типа Radix) нет, но есть собственный "легкий design system" на классах и повторно используемых React-компонентах.

## 6) Ответ на ключевые вопросы напрямую

### Используются ли готовые UI-библиотеки (Radix и т.п.)?

Нет, в базовом слое — нет. Компоненты и стили в основном самописные.

### Есть ли reuse layout и шаблонов?

Да:

- `RootLayout`,
- doctor section layout,
- `AppShell` как универсальная оболочка,
- общий набор повторных UI-компонентов в `shared/ui`.

### CSS — глобальный или модульный?

Сейчас преимущественно глобальный (`globals.css`), без CSS Modules.

### Стили наследуются/переиспользуются или дублируются?

Оба подхода:

- есть выраженное переиспользование через общие классы и токены;
- есть локальные inline-style участки, которые частично дублируют точечные UI-настройки.

## 7) Вывод по текущей зрелости UI-архитектуры

Сильные стороны:

- простая и понятная структура;
- четкие слои и DI;
- хорошее переиспользование каркаса (`AppShell`) и базовых классов;
- минимум внешних зависимостей и "магии".

Ограничения текущего подхода:

- один крупный `globals.css` со временем усложняет поддержку;
- inline-styles в ряде мест мешают единообразию;
- отсутствие компонентной UI-библиотеки дает гибкость, но требует жесткой дисциплины при росте команды/экрана.

В текущем состоянии проект ближе к "самописная, но структурированная UI-платформа" с единым CSS-ядром и ручным набором компонентов.
