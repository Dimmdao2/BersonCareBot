# LOG — Patient App Visual Redesign

## 2026-04-29 — Initiative planning

- Created initiative folder `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/`.
- Added `README.md`, `MASTER_PLAN.md`, phase plans `00`–`05`, and copy-paste prompts.
- Visual source of truth remains `docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md`.

## 2026-04-29 — Plan hardening (post-audit fixes)

Audit выявил 16 узких мест; внесены исправления:

- **Branch policy** зафиксирована: `patient-app-visual-redesign-initiative`. Добавлено в README инициативы и в каждый EXEC промпт.
- **References folder** создана: `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/references/` с README. Если папка пустая — Phase 3/4 идут только по `VISUAL_SYSTEM_SPEC.md` и фиксируют это в `LOG.md`.
- **Mobile max-width 430px** перенесена из Phase 1 в Phase 2 (вместе с PatientBottomNav контейнером, чтобы не было рассинхрона). Acceptance criteria обновлены.
- **CSS variable naming policy** переписана: запрещены суффиксы `*-new`/`*-v2`/`*-tmp`. Введены семантические имена (`--patient-card-radius-mobile`, `--patient-color-primary-soft`, и т.д.). Зафиксировано в README инициативы и MASTER_PLAN §6.
- **PatientGatedHeader** — добавлено описание роли в Phase 2 plan + явный scope правок (не рефакторить, только три действия: убрать gear, профиль справа, нет desktop Back).
- **Greeting time-of-day** сделан **обязательным** через `getAppDisplayTimeZone()` в server-component с передачей в `PatientHomeGreeting` как prop. Запрещён client-side `new Date()`.
- **AppShell default/doctor smoke** добавлен в Phase 1 acceptance.
- **Phase 5 scope** ограничен hard-limits: не редизайнить другие patient-страницы, не делать buttonVariants doctor refactor, не мигрировать legacy `--patient-radius*`, не более ~5 файлов вне scope.
- **Mutual-exclusivity nav test** добавлен в Phase 2 (matchMedia mock или responsive class assertion) и в acceptance criteria.
- **PROMPT 00 — START HERE** добавлен в начало `PROMPTS_PLAN_EXEC_AUDIT_FIX.md`: проверка ветки, чтение README/MASTER_PLAN/LOG, проверка references/, явный запрет исполнять архивные промпты.
- **Final audit model** — единый default Composer 2 на всех этапах включая финальный audit. GPT 5.5/Opus 4.7 — только по явной просьбе или unresolved contradictions.
- **SOS layout** — всегда red icon circle + текст + danger button. `imageUrl` (если есть) — только декоративный акцент.
- **Out of scope** в MASTER_PLAN §4: явный список patient-страниц, которые не трогаются (booking, reminders, diary, profile, content, courses, lfk, practice).
- **Screenshots в LOG.md** — рекомендованы для финального audit (mobile 390px + desktop 1280px по ключевым блокам).

## 2026-04-29 — Archive markings

Добавлены архивные пометки на:

- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md` (header с указанием статуса "ЗАВЕРШЕНА" и ссылкой на новую инициативу).
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/PROMPTS_PLAN_EXEC_AUDIT_FIX.md` (header "АРХИВ — НЕ ИСПОЛНЯТЬ").
- `.cursor/plans/phase_3_patient_home_1b1dc5a6.plan.md` (header "АРХИВ — НЕ ИСПОЛНЯТЬ").
- `.cursor/plans/phase_4.5_patient_home_a2e6bd38.plan.md` (header "АРХИВ — НЕ ИСПОЛНЯТЬ").

Не помечены как архив (они не относятся к этой инициативе и сохраняют свою валидность):

- `.cursor/plans/exercise_ui_+_references_03b21d8e.plan.md` — completed plan по другой задаче.
- `.cursor/plans/media_hardening_and_logging_1171a669.plan.md` — completed plan по другой задаче.
- `.cursor/plans/system_health_tab_b0e8ec64.plan.md` — активный план по другой задаче.
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_PHASE_*.md`, `GLOBAL_AUDIT.md` — archived контекст, упомянуты в README завершённой инициативы как архив; отдельные шапки не требуются.

## 2026-04-29 — Session sanity check (branch + references)

- Рабочая git-ветка: **`patient-app-visual-redesign-initiative`** (создана от `origin/main`). Ветка **`patient-home-redesign-initiative`** не используется для EXEC этой инициативы (закрытая линия работ).
- Папка **`docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/references/`** существует; **файлов референс-скриншотов нет** (есть только `references/README.md`). До добавления экспортов макетов **Phase 3 и Phase 4 EXEC выполняются только по** `docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md` (как единственному визуальному источнику).
- Доставляемый Phase 0 артефакт **`PLAN_INVENTORY.md`** в папке инициативы отсутствует; в LOG нет записи о завершённом EXEC Phase 0 — **следующая фаза: Phase 0 (Inventory)** по `00_INVENTORY_PLAN.md`.
- В этой инициативе **нет** `AUDIT_PHASE_*.md`; порядок фаз задаётся `LOG.md` и планами `00`–`05`.
- Архивные PROMPT'ы из `docs/PATIENT_HOME_REDESIGN_INITIATIVE/PROMPTS_PLAN_EXEC_AUDIT_FIX.md` и планы `.cursor/plans/phase_3_patient_home_*.plan.md` / `phase_4.5_patient_home_*.plan.md` **не исполняются**.

## 2026-04-29 — Phase 0 / PLAN INVENTORY (readonly)

- Агент: Composer 2; app-код и миграции **не** менялись; full CI **не** запускался.
- Создан **`PLAN_INVENTORY.md`**: зафиксировано расхождение `VISUAL_SYSTEM_SPEC.md` §4 с деревом (на `main`-baseline **нет** `PatientBottomNav`, `patientHomeCardStyles.ts`, стека `PatientHomeToday*`); главная — легаси `page.tsx` + секции.
- **`docs/PATIENT_HOME_REDESIGN_INITIATIVE/README.md`** и **`CONTENT_PLAN.md`** в дереве отсутствуют — inventory опирается на `VISUAL_SYSTEM_SPEC` + правила репозитория.
- **GO для Phase 1** с условием: создавать отсутствующие файлы из scope Phase 1 (`AppShell.test.tsx`, card styles helper), не полагаться на несуществующие импорты блоков «Сегодня» до merge/поставки кода.
- **Пререквизит для Phase 3+**: появление в репозитории компонентов главной из MASTER_PLAN или осознанная перепривязка планов к текущим `PatientHome*` легаси-страницы.
- Следующий шаг: EXEC Phase 1 по `01_FOUNDATION_PLAN.md` + актуализировать `VISUAL_SYSTEM_SPEC.md` §4 после merge, чтобы карта «текущее состояние» совпадала с кодом.

## 2026-04-29 — FIX (AUDIT Phase 0, только mandatory)

- Источник: `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_PHASE_0.md` §2 **Mandatory fixes**.
- Результат: **обязательных исправлений в аудите не задано** («Нет обязательных исправлений…»); app-код не менялся; full CI не запускался.
- Обновлён **`PLAN_INVENTORY.md`**: добавлен §12 (зафиксирован отсутствующий mandatory scope для FIX).
- Minor notes из того же аудита (spec §4, устаревшая строка в LOG и т.д.) **не** трогались — вне запроса FIX-only-mandatory.

## 2026-04-29 — Phase 1 / EXEC (Foundation)

- Ветка: **`patient-app-visual-redesign-initiative`**.
- **`globals.css`**: блок `#app-shell-patient { … }` с семантическими токенами (radii, shadows, colors, page/card/bg/border/text); legacy в `:root` (`--patient-bg`, `--patient-surface`, `--patient-radius`, `--patient-radius-lg`, `--patient-touch`, `--patient-gap`, тени) **не** удалялись и **не** менялись.
- **`AppShell.tsx`**: patient shell фон `bg-[var(--patient-page-bg)]` (`#F7F8FB` через токен); **`max-w-[480px]` без изменений** (430px — Phase 2).
- **`patientHomeCardStyles.ts`** (новый): `patientHomeCardClass`, compact/base/hero/success/warning/danger/gradientWarm, badge- и icon-leading классы на токенах (блоки главной **не** подключались — Phase 3+).
- **`patientVisual.ts`** (новый): patient-only кнопочные классы; **`button-variants.ts` не трогали** (риск doctor/admin).
- **`AppShell.test.tsx`** (новый): smoke patient vs default/doctor без `patient-page-bg` на не-patient вариантах.
- **Проверки:** `npx vitest run src/shared/ui/AppShell.test.tsx` — 3 passed; `pnpm exec eslint` на изменённых ts/tsx — ok; `pnpm --dir apps/webapp typecheck` / `tsc --noEmit` падает из-за **существующих** ссылок в `.next/types/validator.ts` на отсутствующие маршруты (не связано с Phase 1 diff).
- **Отложено:** max-width 430, bottom/top nav, header/settings, правки `PatientHome*`, миграция legacy `--patient-*` usages, расширение `button-variants` — по MASTER_PLAN / Phase 2–3.

## 2026-04-29 — FIX (AUDIT Phase 1, только mandatory)

- Источник: `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_PHASE_1.md` §2 **Mandatory fixes**.
- Результат: **обязательных исправлений не задано** («Нет.»); изменений в Phase 1 app-файлах **не** вносилось; навигация и home blocks **не** трогались; full CI **не** запускался.
- Проверки после FIX: `npx vitest run src/shared/ui/AppShell.test.tsx` — **3 passed**; `pnpm exec eslint` на `AppShell.tsx`, `AppShell.test.tsx`, `patientVisual.ts`, `patientHomeCardStyles.ts` — **без замечаний**.

## 2026-04-29 — Phase 2 / EXEC (Navigation)

- Ветка: **`patient-app-visual-redesign-initiative`**.
- **Breakpoint:** Tailwind **`lg`** (`min-width: 1024px`), реализация через `useViewportMinWidthLg` и responsive-классы (`hidden` / `lg:hidden` / `lg:block`).
- **Mobile max-width:** `PATIENT_MOBILE_SHELL_MAX_PX = 430` в `navigation.ts`; patient shell (`#app-shell-patient`) — `max-w-[430px]` + `data-patient-shell-max-px`; desktop — `lg:max-w-[min(1180px,calc(100vw-2rem))]`. **`patientEmbedMain`:** по плану max-width embed **не меняли** относительно Phase 1 — остаётся **`max-w-[480px]`**, bottom/top nav не рендерятся.
- **`patientHideBottomNav`:** новый флаг в `AppShell`; при `true` скрываются **и** bottom nav, **и** desktop `PatientTopNav` (как в `02_NAVIGATION_PLAN.md`). Экраны входа/гость с **`patientBrandTitleBar`** по-прежнему **без** primary nav (без правок отдельных страниц: условие `!patientBrandTitleBar` в `showPatientShellNav`).
- **`navigation.ts`:** `PATIENT_PRIMARY_NAV_ITEMS` (Сегодня / Запись / Разминки / План / Дневник), `getPatientPrimaryNavActiveId`; `patientNavByPlatform`: **`settings` убран**, иконки справа **`reminders`, `messages`, `profile`**.
- **Новые компоненты:** `PatientBottomNav.tsx`, `PatientTopNav.tsx` (+ тесты); `PatientHeader`: нет Home, нет settings gear, **Back только на mobile** при `showBack`, на desktop при `patientShellNavDocked` иконки справа в шапке пустые (дубли в `PatientTopNav`), **`lg:top-16`** под sticky top nav. **`PatientGatedHeader`** без внутренних правок — только прокидывание новых пропсов через `PatientHeader`.
- **Проверки (targeted, без root `ci`):**  
  `npx vitest run src/shared/ui/PatientBottomNav.test.tsx src/shared/ui/PatientTopNav.test.tsx src/shared/ui/AppShell.test.tsx src/shared/ui/PatientHeader.test.tsx src/app-layer/routes/navigation.test.ts` — **23 passed**.
- **Отложено (backlog):** общий рефакторинг дублирования иконок reminders/messages/profile между `PatientHeader` и `PatientTopNav`; отдельное меню настроек из профиля (UX вне scope Phase 2).

## 2026-04-29 — Phase 3 / EXEC (Home primary)

- Ветка: **`patient-app-visual-redesign-initiative`**.
- **Layout:** `PatientHomeTodayLayout` — mobile одна колонка, desktop `lg:grid` `3fr / 2fr` при наличии правой колонки (быстрые разделы); без «дыр», если ситуаций нет — одна колонка.
- **Greeting:** `getAppDisplayTimeZone()` + `getHourInTimeZone` / `greetingPrefixFromHour` в **server** `PatientHomeToday`; `PatientHomeGreeting` только props (**без** `new Date()` на клиенте); подзаголовок **`Готовы к разминке?`**; имя только при `personalTierOk`; аватар — инициалы при имени.
- **Hero daily_warmup:** `PatientHomeDailyWarmupCard` — градиент `patientHomeCardHeroClass`, бейджи «Разминка дня» + длительность; **fallback длительности `≈ 5 мин`**, если в CMS нет поля (отдельный numeric в `content_sections` сейчас не подключён); `?from=daily_warmup` на ссылке первого раздела по `sort_order`; картинка — `<img>` при `imageUrl` (сейчас не передаётся) или декоративный блок `Sparkles`.
- **Источник hero/ситуаций:** сортировка `content_sections` из существующего `listVisible` (**без** смены модели БД); первый элемент — hero, остальные — горизонтальный ряд плиток; **без** привязки цвета к slug/title (нейтральный `bg-muted/80`).
- **Booking:** `PatientHomeBookingCard` — success surface, `Calendar`, CTA «Записаться» / «Мои приёмы»; **guestMode** — оба линка на `/app?next=/app/patient`.
- **`page.tsx` (минимальная склейка):** при `cabinet | materials` рендерится `PatientHomeToday`; блок **`PatientHomeLessonsSection`** скрыт при `showPrimaryToday`, чтобы не дублировать карточки разделов; **`PatientHomeBrowserHero`** снят с главной в пользу primary-зоны (дневник/прочее остаются в bottom nav и остальных экранах).
- **`patientHomeCardStyles`:** уточнён комментарий hero-класса (граница `#ddd6fe` по spec).
- **Проверки (targeted, без root `ci`):**  
  `npx vitest run src/app/app/patient/home/PatientHomeTodayLayout.test.tsx src/app/app/patient/home/PatientHomeToday.test.tsx src/app/app/patient/home/PatientHomeDailyWarmupCard.test.tsx src/app/app/patient/home/PatientHomeBookingCard.test.tsx src/app/app/patient/home/PatientHomeSituationsRow.test.tsx src/app/app/patient/home/PatientHomeGreeting.test.tsx` — **15 passed**;  
  `pnpm exec eslint` на изменённых `page.tsx`, `home/*` Phase 3 — **без замечаний**.
- **Отложено:** поле длительности/обложки из CMS когда появится в API; ссылка «Все ситуации» (нет отдельного маршрута); визуальный QA 320–390px vs ref.

## 2026-04-29 — Phase 4 / EXEC (Home secondary)

- Ветка: **`patient-app-visual-redesign-initiative`**.
- **Компоненты (`04_HOME_SECONDARY_PLAN.md`):**  
  `PatientHomeProgressBlock` — две зоны (прогресс + streak, `Flame`), `role="progressbar"`, гостевой режим без персональных чисел; цель дня **`PATIENT_HOME_DAILY_PRACTICE_TARGET = 3`** до отдельного patient-practice API (зафиксировано в `page.tsx`).  
  `PatientHomeNextReminderCard` — warning-карточка, bell leading, `formatReminderScheduleLabel`, ссылка на `routePaths.patientReminders`.  
  `PatientHomeMoodCheckin` — client, градиент `patientHomeCardGradientWarmClass`, 5 равных слотов, emoji/CMS `moodIconUrls`, POST `/api/patient/mood` с optimistic rollback.  
  `PatientHomeSosCard` — danger, **всегда** красный круг + `AlertTriangle` + текст + `patientButtonDangerOutlineClass`; `imageUrl` из `content_pages` — **только** мелкий декор в углу (не image-led).  
  `PatientHomePlanCard` — base card, leading icon, ссылка `routePaths.patientTreatmentProgram(id)`; полоса прогресса **не** показывается без данных (без доп. запросов к деталям экземпляра).  
  `PatientHomeSubscriptionCarousel` — snap-x, `patientHomeCardCompactClass` + `patientBadgePrimaryClass`, те же темы что уведомления (без gating).  
  `PatientHomeCoursesRow` — compact cards, ссылки на content slug или каталог.
- **`patientVisual.ts`:** `patientButtonWarningOutlineClass` для CTA напоминания.
- **`page.tsx` (склейка вне списка 04, по аналогии с Phase 3):** при `showPrimaryToday` секция `#patient-home-secondary`: параллельные существующие вызовы `listEmergencyTopics`, `courses.listPublishedCatalog`; при `personalDataOk` + user — `reminders.listRulesByUser`, `treatmentProgramInstance.listForPatient`, `diaries.listLfkComplexes`, два `listLfkSessionsInRange` (сегодня в app TZ + 90 дней для streak). **Сервисы/repos/API-роуты не менялись.** Root **`pnpm run ci`** не запускался.
- **Проверки (targeted):**  
  `pnpm --dir apps/webapp test -- src/app/app/patient/home/PatientHomeProgressBlock.test.tsx src/app/app/patient/home/PatientHomeNextReminderCard.test.tsx src/app/app/patient/home/PatientHomeMoodCheckin.test.tsx src/app/app/patient/home/PatientHomeSosCard.test.tsx src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx` + `PatientHomePlanCard.test.tsx`, `PatientHomeCoursesRow.test.tsx` + регрессия Phase 3 (`PatientHomeToday*` и др.) — **все passed**;  
  `pnpm exec eslint` на изменённых ts/tsx — **без ошибок** (после `no-img-element` disable на SOS).
- **Отложено:** отдельный API настроек `patient_home_mood_icons`; реальный `practiceTarget`/streak из patient-practice; процент плана без доп. запроса к деталям экземпляра.

## 2026-04-29 — FIX (AUDIT Phase 4, только mandatory)

- Источник: `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_PHASE_4.md` §2 **Mandatory fixes**.
- Результат: **обязательных исправлений не задано** («Нет.»); app-код Phase 4 **не менялся**; final cleanup Phase 5 **не** начинался; root **`pnpm run ci`** **не** запускался.
- Проверки после FIX:  
  `npx vitest run src/app/app/patient/home/PatientHomeProgressBlock.test.tsx src/app/app/patient/home/PatientHomeNextReminderCard.test.tsx src/app/app/patient/home/PatientHomeMoodCheckin.test.tsx src/app/app/patient/home/PatientHomeSosCard.test.tsx src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx src/app/app/patient/home/PatientHomePlanCard.test.tsx src/app/app/patient/home/PatientHomeCoursesRow.test.tsx` — **17 passed** (7 files);  
  `pnpm exec eslint` на `page.tsx`, `PatientHomeProgressBlock.tsx`, `PatientHomeNextReminderCard.tsx`, `PatientHomeMoodCheckin.tsx`, `PatientHomeSosCard.tsx`, `PatientHomePlanCard.tsx`, `PatientHomeSubscriptionCarousel.tsx`, `PatientHomeCoursesRow.tsx`, `src/shared/ui/patientVisual.ts`, соответствующие `*.test.tsx` Phase 4 — **без замечаний**.

## 2026-04-29 — Phase 5 / EXEC (Tests, QA cleanup, final audit doc)

- Ветка: **`patient-app-visual-redesign-initiative`**.
- **План:** `05_TESTS_QA_CLEANUP_PLAN.md` — тесты без хрупких Tailwind-снапшотов; a11y/responsive на уровне кода; мёртвые imports только в файлах инициативы; **`AUDIT_VISUAL_FINAL.md`** создан; root **`pnpm run ci`** **не** запускался.
- **Код:** `PatientHomeMoodCheckin.tsx` — у корневой секции добавлен **`min-h-[140px]`** (согласование с `VISUAL_SYSTEM_SPEC.md` §10.7 / стабильная высота блока на narrow viewports).
- **Тесты (расширены):** `PatientBottomNav.test.tsx`, `PatientTopNav.test.tsx` — **`aria-current="page"`** для активных пунктов; `PatientHomeDailyWarmupCard.test.tsx` — `<img>` при `imageUrl`, декоративный fallback без `img` при отсутствии URL; `PatientHomeSituationsRow.test.tsx` — одинаковые `className` у плиток для разных slug; `PatientHomeSubscriptionCarousel.test.tsx` — без `role="button"`, один `Link`; `PatientHomeMoodCheckin.test.tsx` — все кнопки выбора настроения **disabled** на время pending POST, после успеха снова доступны.
- **Targeted Vitest (пакет из `05`):**  
  `npx vitest run src/app/app/patient/home/PatientHomeTodayLayout.test.tsx src/app/app/patient/home/PatientHomeToday.test.tsx src/app/app/patient/home/PatientHomeDailyWarmupCard.test.tsx src/app/app/patient/home/PatientHomeBookingCard.test.tsx src/app/app/patient/home/PatientHomeSituationsRow.test.tsx src/app/app/patient/home/PatientHomeProgressBlock.test.tsx src/app/app/patient/home/PatientHomeNextReminderCard.test.tsx src/app/app/patient/home/PatientHomeMoodCheckin.test.tsx src/app/app/patient/home/PatientHomeSosCard.test.tsx src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx src/shared/ui/AppShell.test.tsx src/shared/ui/PatientHeader.test.tsx src/shared/ui/PatientBottomNav.test.tsx src/shared/ui/PatientTopNav.test.tsx` — **14 файлов, 44 теста passed**.  
  Дополнительно: `PatientHomePlanCard.test.tsx`, `PatientHomeCoursesRow.test.tsx`, `PatientHomeGreeting.test.tsx` — **3 файла, 10 passed**.
- **`pnpm --dir apps/webapp typecheck`:** **падает** на **существующих** ссылках `.next/types/validator.ts` на отсутствующие маршруты (как в Phase 1 LOG); не регрессия Phase 5.
- **`pnpm --dir apps/webapp lint`:** **exit 0** (`eslint .` + `check-media-preview-invariants.sh`).
- **Документ:** `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_VISUAL_FINAL.md` — вердикт **PASS WITH DOCUMENTED GAPS**; ручной visual QA по ширинам и before/after скрины — **вне агента** до экспортов в `references/`.
- **Скриншоты before/after (рекомендовано, плейсхолдеры — файлов в `references/` пока нет):**
  - Mobile **390px:** `references/before-after/mobile-390-hero.png`, `…-booking.png`, `…-situations.png`, `…-progress.png`, `…-reminder.png`, `…-mood.png`, `…-sos.png`, `…-plan.png`
  - Desktop **1280px:** `references/before-after/desktop-1280-hero.png`, `…-booking.png`, `…-situations.png`, `…-progress.png`, `…-reminder.png`, `…-mood.png`, `…-sos.png`, `…-plan.png`  
  (после съёмки заменить на реальные имена файлов и закоммитить в `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/references/`.)

## 2026-04-29 — FIX (AUDIT_VISUAL_FINAL, только mandatory)

- Источник: `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_VISUAL_FINAL.md` §2 **Mandatory fixes**.
- Результат: **обязательных исправлений не задано** («Нет»); app-код инициативы **не менялся**; пункт про `.next/types/validator.ts` в аудите остаётся **follow-up вне mandatory** (как явно отмечено в §2 финального аудита). Root **`pnpm run ci`** **не** запускался.
- Проверки после FIX:  
  `npx vitest run src/app/app/patient/home/PatientHomeTodayLayout.test.tsx src/app/app/patient/home/PatientHomeToday.test.tsx src/app/app/patient/home/PatientHomeDailyWarmupCard.test.tsx src/app/app/patient/home/PatientHomeBookingCard.test.tsx src/app/app/patient/home/PatientHomeSituationsRow.test.tsx src/app/app/patient/home/PatientHomeProgressBlock.test.tsx src/app/app/patient/home/PatientHomeNextReminderCard.test.tsx src/app/app/patient/home/PatientHomeMoodCheckin.test.tsx src/app/app/patient/home/PatientHomeSosCard.test.tsx src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx src/shared/ui/AppShell.test.tsx src/shared/ui/PatientHeader.test.tsx src/shared/ui/PatientBottomNav.test.tsx src/shared/ui/PatientTopNav.test.tsx` — **14 файлов, 44 теста passed**.

## 2026-04-29 — FIX (AUDIT Phase 3, только mandatory)

- Источник: `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_PHASE_3.md` §2 **Mandatory fixes**.
- Результат: **обязательных исправлений не задано** («Нет.»); app-код Phase 3 **не менялся**; secondary blocks **не** трогались; root **`pnpm run ci`** **не** запускался.
- Проверки после FIX:  
  `npx vitest run src/app/app/patient/home/PatientHomeTodayLayout.test.tsx src/app/app/patient/home/PatientHomeToday.test.tsx src/app/app/patient/home/PatientHomeDailyWarmupCard.test.tsx src/app/app/patient/home/PatientHomeBookingCard.test.tsx src/app/app/patient/home/PatientHomeSituationsRow.test.tsx src/app/app/patient/home/PatientHomeGreeting.test.tsx` — **15 passed** (6 files);  
  `pnpm exec eslint` на `page.tsx`, `src/app/app/patient/home/PatientHomeToday.tsx`, `PatientHomeTodayLayout.tsx`, `PatientHomeGreeting.tsx`, `PatientHomeDailyWarmupCard.tsx`, `PatientHomeBookingCard.tsx`, `PatientHomeSituationsRow.tsx`, `patientHomeCardStyles.ts`, соответствующие `*.test.tsx` — **без замечаний**.

## 2026-04-29 — FIX (AUDIT Phase 2, только mandatory)

- Источник: `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_PHASE_2.md` §2 **Mandatory fixes**.
- Результат: **обязательных исправлений не задано** («Нет.»); app-код Phase 2 (nav / header / shell) **не менялся**; home primary blocks **не** трогались; root **`pnpm run ci`** **не** запускался.
- Проверки после FIX:  
  `npx vitest run src/shared/ui/PatientBottomNav.test.tsx src/shared/ui/PatientTopNav.test.tsx src/shared/ui/AppShell.test.tsx src/shared/ui/PatientHeader.test.tsx src/app-layer/routes/navigation.test.ts` — **23 passed**;  
  `pnpm exec eslint` на `AppShell.tsx`, `PatientBottomNav.tsx`, `PatientTopNav.tsx`, `PatientHeader.tsx`, `PatientGatedHeader.tsx`, `navigation.ts`, соответствующие `*.test.tsx` / `navigation.test.ts` — **без замечаний**.

## 2026-04-29 — FIX (AUDIT_VISUAL_FINAL mandatory cleanup)

- Источник: `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/AUDIT_VISUAL_FINAL.md` (обновлённый независимый аудит).
- **`AppShell.tsx`:** удалено runtime-монтирование `PatientQuickAddFAB` (и связанный проп `hidePatientQuickAddFAB`) — после продуктового решения FAB больше не используется в patient shell.
- **`PatientBottomNav.tsx`:** bottom nav переведён в app-like `fixed bottom` (`fixed bottom-0 left-1/2 -translate-x-1/2`, `lg:hidden`) с тенью `--patient-shadow-nav`; mobile max-width 430 сохранён через `PATIENT_MOBILE_SHELL_MAX_PX`.
- **`AUDIT_VISUAL_FINAL.md`:** mandatory cleanup переведён в статус «закрыто», обновлён verdict до `PASS WITH MINOR NOTES`, подтверждён commit-уровневый split поставки инициативы.
- **Актуализация checks:** старое замечание в LOG о падении `pnpm --dir apps/webapp typecheck` на `.next/types/validator.ts` больше не является текущим baseline для этого среза.
- Проверки после FIX:
  - `pnpm --dir apps/webapp exec vitest run src/shared/ui/AppShell.test.tsx src/shared/ui/PatientBottomNav.test.tsx src/shared/ui/PatientTopNav.test.tsx src/shared/ui/PatientHeader.test.tsx` — **17 passed**.
  - `pnpm --dir apps/webapp exec vitest run src/app/app/patient/home/PatientHomeTodayLayout.test.tsx src/app/app/patient/home/PatientHomeToday.test.tsx src/app/app/patient/home/PatientHomeDailyWarmupCard.test.tsx src/app/app/patient/home/PatientHomeBookingCard.test.tsx src/app/app/patient/home/PatientHomeSituationsRow.test.tsx src/app/app/patient/home/PatientHomeProgressBlock.test.tsx src/app/app/patient/home/PatientHomeNextReminderCard.test.tsx src/app/app/patient/home/PatientHomeMoodCheckin.test.tsx src/app/app/patient/home/PatientHomeSosCard.test.tsx src/app/app/patient/home/PatientHomeSubscriptionCarousel.test.tsx` — **27 passed**.
  - `pnpm --dir apps/webapp exec vitest run src/app/app/patient/home/PatientHomePlanCard.test.tsx src/app/app/patient/home/PatientHomeCoursesRow.test.tsx src/app/app/patient/home/PatientHomeGreeting.test.tsx` — **10 passed**.
  - `pnpm --dir apps/webapp exec eslint src/shared/ui/AppShell.tsx src/shared/ui/PatientBottomNav.tsx` — **без замечаний**.
  - `pnpm --dir apps/webapp typecheck` — **passed**.

## 2026-04-30 — VISUAL_SYSTEM_SPEC apply complete (APPLY_VISUAL_SPEC steps 0–15)

- **Источник плана:** `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/APPLY_VISUAL_SPEC_TASK_FOR_GPT55.md` (шаги 0–15).
- **Ветка:** `feat/patient-home-cms-editor-uxlift-2026-04-29`.
- **Содержание:** foundation (`patientHomeCardStyles`, `AppShell` patient + `PatientTopNav`), все блоки главной по `VISUAL_SYSTEM_SPEC` §10.1–§10.12, layout «Сегодня» по §6.2 (`PatientHomeTodayLayout` + тесты).
- **Проверка:** `pnpm install --frozen-lockfile && pnpm run ci` — **зелёный** на этом срезе (lint, typecheck, integrator + webapp tests, build integrator + webapp, `registry-prod-audit`).
- **Ручной visual QA** по `05_TESTS_QA_CLEANUP_PLAN.md` и остаточные риски из `AUDIT_VISUAL_FINAL.md` §4 — вне этого коммита, на владельца продукта/дизайна.

## Template for future entries

```md
## YYYY-MM-DD — Phase X / PLAN|EXEC|AUDIT|FIX

- Agent/model:
- Scope:
- Files changed:
- Summary:
- Tests/checks:
- Visual gaps:
- Deviations from spec:
- Next step:
```

