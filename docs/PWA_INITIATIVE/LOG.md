# PWA — журнал

## 2026-05-18 — Web Push + email: контур напоминаний (MVP)

- **Канал `web_push`:** prefs, матрица тем, таблица подписок, `GET/POST` patient API, отправка из webapp по VAPID из `system_settings`.
- **Email:** transactional SMTP из `smtp_outbound`, те же гейты темы/канала; вызов из integrator через M2M (см. ниже); опционально **List-Unsubscribe** (mailto); интервал между письмами напоминаний одному пользователю через `email_send_cooldowns` (ключ `!reminder_txn_v1`).
- **Integrator `reminders.dispatchDue`:** после расчёта текста/темы — `notifyPatientReminderChannels` → `POST /api/integrator/patient-reminders/notify-channels` (подпись + `x-bersoncare-idempotency-key` `prn:<occurrenceId>:channels`).
- **`public/sw.js`:** обработчики `push` и `notificationclick` (открытие только same-origin, путь `/app/*`); по-прежнему без `fetch`.
- **iOS / Safari:** Web Push в установленном PWA зависит от версии ОС и Safari; на части устройств недоступен — не входит в гарантию продукта; см. [`PHASE_02`](PHASE_02_INSTALL_FLOW.md).

## 2026-05-18 — Укрепление VAPID / SW / контур push

- **`web_push_vapid`:** ответы `GET`/`PATCH`/batch и RSC `/app/settings` не держат `privateKey` в данных для композиции страницы (`redactAdminSettingsForClient` на списке admin); в HTTP/API — `hasPrivateKey`; усилена проверка декодированных длин ключей P-256 (`webPushVapidPatch.ts`, `webPushVapidRuntime.ts`).
- **Историческая запись (до MVP push):** ниже описан старый контур — **`GET /api/patient/web-push/status`** ранее отдавал **501**; **SW** был только install/activate. Актуальное поведение — в блоке «Web Push + email» выше.
- **`public/sw.js` (исторически):** только `install`/`activate`, без перехвата `fetch`.
- **Заглушка (устарело):** `GET /api/patient/web-push/status` → **501** `not_implemented`; контракт расширения — `apps/webapp/src/modules/web-push/ports.ts`.

## 2026-05-18 — SW: регистрация `scope: "/app"`

- **`PwaInstallSection`:** `register("/sw.js", { scope: routePaths.root })` — совпадает с **`manifest.scope`**; страница **`/`** не входит в область SW.
- **Комментарии:** `public/sw.js`, `src/app/manifest.ts`; документы [`PHASE_00`](PHASE_00_PRINCIPLES_AND_SCOPE.md), [`PHASE_02`](PHASE_02_INSTALL_FLOW.md), [`apps/webapp/README`](../../apps/webapp/README.md), [`ARCHITECTURE.md`](../ARCHITECTURE.md).

## 2026-05-18 — manifest: `scope: "/app"`

- **`apps/webapp/src/app/manifest.ts`:** `scope` изменён с **`/`** на **`/app`** — установленное Web App по URL охватывает кабинет; публичный **`/`** и пути вне **`/app`** (в т.ч. **`/legal/*`**) вне manifest scope.
- **Документы:** [`PHASE_00`](PHASE_00_PRINCIPLES_AND_SCOPE.md) (продуктовый пункт), [`PHASE_02`](PHASE_02_INSTALL_FLOW.md), [`PHASE_03`](PHASE_03_MANIFEST_AUDIT.md), [`BASELINE_STRUCTURE`](BASELINE_STRUCTURE.md), [`README`](README.md) инициативы; [`apps/webapp/README.md`](../../apps/webapp/README.md); [`docs/README.md`](../README.md); [`ARCHITECTURE.md`](../ARCHITECTURE.md).

## 2026-05-18 — Web Push: синхронизация индекса доков

- **`ROADMAP.md`:** этап 4 — статус **done**; уточнён текст про код в репо vs операторский ввод ключей на стенде.
- **`BASELINE_STRUCTURE.md`**, **`BACKLOG.md`**, **`WEB_PUSH_VAPID_ADMIN.plan.md` (§9/DoD):** факт реализации VAPID в админке; backlog — только полный контур push.
- **`route.ts` (PATCH admin settings):** один вызов `getSetting` для `web_push_vapid` на запрос (валидация + аудит).
- **Корневая документация проекта:** `docs/README.md` (блок PWA), `ARCHITECTURE.md` (PWA + этап 4), `docs/ARCHITECTURE/CONFIGURATION_ENV_VS_DATABASE.md` (ключ `web_push_vapid`), `apps/webapp/src/app/api/api.md` (**admin/settings**).

## 2026-05-18 — Web Push VAPID в админке (`web_push_vapid`)

- **Ключ:** `web_push_vapid`, scope `admin`, значение `{ publicKey, privateKey }` в `system_settings` (зеркало integrator через `updateSetting`).
- **Реализация:** валидация base64url + лимит длины, первый save требует оба ключа, пустой `privateKey` при PATCH — merge в `service.ts`; аудит PATCH без сырого private; UI блок на `/app/settings` (вкладка параметров приложения); `getWebPushVapidKeyPair()` в `webPushVapidRuntime.ts` для следующего этапа sender.
- **План:** [WEB_PUSH_VAPID_ADMIN.plan.md](WEB_PUSH_VAPID_ADMIN.plan.md).

## 2026-05-18 — синхронизация документации проекта (PWA и webapp)

- **`apps/webapp/README.md`:** в **URL Spaces** добавлен **`/`** (публичный лендинг + PWA); уточнено различие **`/app/patient/install`** (в сессии) vs **`/`**.
- **`docs/PWA_INITIATIVE/BASELINE_STRUCTURE.md`:** снимок 2026-05-15 сохранён как baseline; добавлены актуальные факты первой волны (SW, маркетинг); блок «чего нет» — только офлайн/push.
- **`docs/README.md`**, **`ARCHITECTURE.md`**, **`docs/APP_RESTRUCTURE_INITIATIVE/STRUCTURE_AUDIT.md`:** ссылки и формулировки согласованы с публичным **`/`** и чеклистом стенда.

## 2026-05-18 — аудит доков и хвосты после ревью

- **`PHASE_00`:** п.6 и таблица «Якоря» приведены к факту (лендинг на `/`, без редиректа в `page.tsx`); добавлены строка про `sw.js` / `PwaInstallSection`, блок **«Верификация на стенде»** с незакрытыми чекбоксами для оператора; DoD разделён на «репо» vs «стенд».
- **`PHASE_01`–`PHASE_03`:** проверки разделены на **автоматические** и **ручные**; снята ложная отметка «всё [x]» для браузера/Telegram/HTTP на origin; в фазе 2 чеклист iOS переименован с «только Safari» на **iOS**.
- **Код:** в `PwaInstallSection` текст для iOS нейтрален относительно Safari-only (Chrome на iOS).

## 2026-05-18 — первая волна (фазы 1–3 закрыты в коде)

**Фаза 1 — лендинг `/`:** убран `redirect("/app")`; RSC-лендинг (`MarketingHomeLanding`) — ценность продукта, блок «Обо мне», ссылка на внешний сайт `https://dmitryberson.ru`, подвал `LegalFooterLinks`; отдельные `metadata` для `/`. Нет кнопки «Войти» и скрытого редиректа в `/app`. OAuth по-прежнему уходит на `/app?…` (проверено по коду callback).

**Фаза 2 — установка:** клиентский `PwaInstallSection` — `beforeinstallprompt` + кнопка «Установить», fallback-текст для меню Chrome, iOS — инструкция «Поделиться → На экран „Домой“», `appinstalled` сбрасывает промпт и показывает подтверждение; в **`isMessengerMiniAppHost()`** регистрация SW **не** вызывается.

**Service worker:** `public/sw.js` — только `install`/`activate`/`fetch` с passthrough в сеть, без кэша HTML/API; регистрация с лендинга с **`scope: "/app"`** (см. запись **«SW: регистрация scope: "/app"»** выше; в день первой волны в коде фиксировали **`/`**).

**Фаза 3 — manifest:** кодовый аудит `manifest.ts`: `start_url: /app/patient`, `scope: /app` (см. также запись **«manifest: scope: "/app"»** выше), `display: standalone`, `theme_color: #284da0`, иконки `/pwa-icon-192.png`, `/pwa-icon-512.png` (`purpose: any`). Отдельные **maskable**-иконки не добавлялись (нет ассетов) — остаётся в [BACKLOG](BACKLOG.md) при появлении набора.

**Проверки агента:** `pnpm --filter @bersoncare/webapp lint`, `typecheck`, `pnpm --filter @bersoncare/webapp build`, vitest `e2e/smoke-app-router-rsc-pages-inprocess.test.ts` (добавлен прогрев `homeRoot`). Ручной DevTools Manifest / установка с реального телефона — на стенде после выкладки.

**Файлы:** `apps/webapp/src/app/page.tsx`, `src/shared/ui/marketing/MarketingHomeLanding.tsx`, `PwaInstallSection.tsx`, `public/sw.js`, `src/app/manifest.ts` (комментарий), `e2e/smoke-app-router-rsc-pages-inprocess.test.ts`.

**Намеренно не делали:** Web Push, офлайн-кэш, maskable-иконки, CMS-блоки на главной (см. BACKLOG).

## 2026-05-18

- Планы первой волны **разнесены по файлам**: `PHASE_00_PRINCIPLES_AND_SCOPE.md` … `PHASE_03_MANIFEST_AUDIT.md`, `BACKLOG.md`; `ROADMAP.md` — **индекс**.
- Ранее в этот день: расширен монолитный `ROADMAP.md` (scope, DoD, проверки по фазам, порядок исполнения); затем содержимое вынесено в файлы фаз.
- Дополнительно улучшены phase-файлы: добавлены проверочные критерии `lint/typecheck`, уточнён рекомендуемый порядок фаз (1 → 2 → 3, с допустимым ранним pre-check manifest), добавлены требования к артефактам закрытия фаз.

## 2026-05-16

- Добавлен **`ROADMAP.md`**: фазы 1–3 (лендинг `/`, кнопка «Установить» + installability, аудит манифеста), Definition of Done, backlog (CMS на главной, push, офлайн, rename `patient` вне scope).
- Продуктовые решения зафиксированы в ROADMAP: главная без «Войти» и без авто‑редиректа; `start_url` на `/app/patient`; врач по `/app/doctor`; iOS — инструкция, не Chrome‑оболочка.

## 2026-05-15

- Заведена папка `docs/PWA_INITIATIVE/`, добавлен **`BASELINE_STRUCTURE.md`** (снимок структуры до SW / офлайна / push).
- **Фаза 0 PWA:** `src/app/manifest.ts`, плейсхолдер‑иконки в `public/`, доработка `src/app/layout.tsx` (`themeColor`, `appleWebApp`, apple touch icon).
- **Service worker не подключался** — без изменения поведения мини‑аппов и сети.
