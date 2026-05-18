# PWA — журнал

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

**Service worker:** `public/sw.js` — только `install`/`activate`/`fetch` с passthrough в сеть, без кэша HTML/API; scope `/`, регистрация с лендинга.

**Фаза 3 — manifest:** кодовый аудит `manifest.ts`: `start_url: /app/patient`, `scope: /`, `display: standalone`, `theme_color: #284da0`, иконки `/pwa-icon-192.png`, `/pwa-icon-512.png` (`purpose: any`). Отдельные **maskable**-иконки не добавлялись (нет ассетов) — остаётся в [BACKLOG](BACKLOG.md) при появлении набора.

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
