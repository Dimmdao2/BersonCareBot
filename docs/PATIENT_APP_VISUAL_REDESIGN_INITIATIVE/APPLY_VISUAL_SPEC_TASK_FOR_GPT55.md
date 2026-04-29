# GPT 5.5 — Apply VISUAL_SYSTEM_SPEC.md поверх home-схемы (пошагово)

## Контекст

Ветка `feat/patient-home-cms-editor-uxlift-2026-04-29` содержит unified (home base + slug-history + CMS-editor UX lift). Visual redesign (`docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md`) **не применён к runtime-компонентам** — они остались в home-tip упрощённой форме (минимальный JSX без visual-токенов).

Эталонные visual-реализации находятся в **`backup/visual-with-dirty-2026-04-29`** (origin) — там каждый `apps/webapp/src/app/app/patient/home/PatientHome*.tsx` уже стилизован по spec. Задача — перенести **JSX/стили/визуальные токены** оттуда в текущие home-компоненты, **сохранив home props и backend-интеграции** (mood-API, practice-API, streak, anonymous-guest detection).

## Жёсткие запреты (нельзя нарушать ни в одном шаге)

1. **Не удалять и не менять backend-интеграции home:**
   - `apps/webapp/src/modules/patient-mood/*`
   - `apps/webapp/src/modules/patient-practice/*`
   - `apps/webapp/src/app/api/patient/mood/*`
   - `apps/webapp/src/app/api/patient/practice/*`
   - mood/practice DI в `apps/webapp/src/app-layer/di/buildAppDeps.ts`.
2. **Не менять props/сигнатуры компонентов**, на которые ссылается `PatientHomeToday.tsx` или `patient/page.tsx`. JSX внутри компонентов меняется свободно, входы — нет.
3. **Не трогать `patient_home_blocks` / `patient_home_block_items` schema** — текущая (`code` PK + overrides) остаётся.
4. **Не удалять `PatientHomeToday.tsx`** (225 строк home-версия — это контейнер с бизнес-логикой). Менять разрешено только её JSX-часть и стили.
5. **Не использовать `deps.patientHome.getCmsBlockSnapshot(...)`** из visual+WIP — это другая API. Использовать только home `deps.patientHomeBlocks.listBlocksWithItems()` (уже работает).
6. **Не вводить новые env-переменные.** Patient-токены живут в `globals.css` + `system_settings`.
7. **CI обязателен:** `pnpm install --frozen-lockfile && pnpm run ci` зелёный после каждого commit. Если CI падает — фиксить, не пропускать.
8. **Один компонент = один commit.** Не объединять.
9. **Не трогать `doctor/*`, `admin/*`, `settings/*`** — это out-of-scope per VISUAL_SYSTEM_SPEC §3.2.
10. **Не пушить без явного запроса пользователя.**

## Эталонные visual-токены (уже есть в текущем коде)

- `apps/webapp/src/app/globals.css` — `#app-shell-patient` scope с `--patient-color-primary`, `--patient-color-success`, `--patient-color-warning`, `--patient-color-danger`, `--patient-text-primary/secondary/muted`, `--patient-card-bg`, `--patient-page-bg`, `--patient-border`, etc.
- `apps/webapp/src/shared/ui/patientVisual.ts` — готовые кнопочные классы (`patientButtonPrimaryClass`, `patientButtonSuccessClass`, `patientButtonSecondaryClass`, `patientButtonGhostLinkClass`, `patientButtonDangerOutlineClass`, `patientButtonWarningOutlineClass`).
- `apps/webapp/src/shared/ui/PatientTopNav.tsx` — готовый desktop top nav (`lg+`).

Если нужны дополнительные классы карточек (`patientHomeCardSuccessClass`, `patientHomeCardWarningClass`, `patientHomeCardDangerClass`, `patientHomeCardGradientWarmClass`, `patientHomeCardCompactClass`, `patientHomeCardHeroClass`, `patientIconLeadingClass`, `patientIconLeadingWarningClass`, `patientBadgeDurationClass`, `patientBadgePrimaryClass`) — взять из:

```bash
git show backup/visual-with-dirty-2026-04-29:apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts
```

и расширить текущий `patientHomeCardStyles.ts` (NB: текущий — 1 экспорт `patientHomeCardClass`; не удалять его, оставить как backward-compat alias).

## План пошагового выполнения

### Шаг 0 — Setup ветки

```bash
git fetch origin
git switch feat/patient-home-cms-editor-uxlift-2026-04-29   # уже текущая
git status   # должно быть clean
pnpm install --frozen-lockfile
pnpm run ci   # baseline зелёный
```

Если `git status` не clean — остановиться, отчитаться пользователю, не действовать.

### Шаг 1 — Расширить `patientHomeCardStyles.ts` (foundation, без runtime-эффекта)

Файл: `apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts`.

Добавить экспорты:
- `patientHomeCardClass` — оставить как сейчас (backward-compat).
- `patientHomeCardCompactClass` — компактная карточка для carousels.
- `patientHomeCardHeroClass` — hero gradient (warmup §10.2).
- `patientHomeCardSuccessClass` — booking §10.3.
- `patientHomeCardWarningClass` — reminder §10.6.
- `patientHomeCardDangerClass` — SOS §10.8.
- `patientHomeCardGradientWarmClass` — mood §10.7.
- `patientIconLeadingClass`, `patientIconLeadingWarningClass`, `patientIconLeadingDangerClass` — иконные круги.
- `patientBadgeDurationClass`, `patientBadgePrimaryClass`, `patientBadgeSubscriptionClass` — бейджи.

**Эталон:** `git show backup/visual-with-dirty-2026-04-29:apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts`.

CI: `pnpm typecheck && pnpm test`.

Commit: `feat(patient-visual): patientHomeCardStyles — variants по VISUAL_SYSTEM_SPEC §10.x`.

### Шаг 2 — `AppShell.tsx` patient variant: ширина + bg + lg PatientTopNav

Файл: `apps/webapp/src/shared/ui/AppShell.tsx`.

Изменить **только ветку `if (variant === "patient" || variant === "patient-wide")`**:
- `bg-[var(--patient-surface)]` → `bg-[var(--patient-page-bg)]` (страничный fb).
- `max-w-[480px]` → `max-w-[430px] lg:max-w-[min(1180px,calc(100vw-2rem))]` (mobile + desktop wide).
- Добавить рендер `<PatientTopNav />` на `lg+` через `<div className="z-50 hidden shrink-0 lg:block"><PatientTopNav /></div>`, размещение — над `PatientGatedHeader`.
- Сохранить **все существующие props** (`patientFloatingSlot`, `patientEmbedMain`, `patientHideHome`, `patientHideRightIcons`, `patientBrandTitleBar`, `patientTitleBadge`, `patientHideBottomNav`).
- `PatientBottomNav` оставить как есть (`< lg`).
- `patient-wide` variant больше не нужен — убрать (после консолидации `patient` уже расширяется на lg+). Но: проверить, нет ли вызовов `variant="patient-wide"` в коде (`rg`); если есть — заменить на `variant="patient"`.

CI: `pnpm typecheck && pnpm test`.

Commit: `feat(patient-visual): AppShell patient variant — page-bg, lg breakpoint, PatientTopNav`.

### Шаг 3-13 — Адаптация компонентов home (ОДИН коммит на компонент)

Для каждого из следующих файлов:

```
apps/webapp/src/app/app/patient/home/PatientHomeGreeting.tsx
apps/webapp/src/app/app/patient/home/PatientHomeDailyWarmupCard.tsx
apps/webapp/src/app/app/patient/home/PatientHomeBookingCard.tsx
apps/webapp/src/app/app/patient/home/PatientHomeSituationsRow.tsx
apps/webapp/src/app/app/patient/home/PatientHomeNextReminderCard.tsx
apps/webapp/src/app/app/patient/home/PatientHomeMoodCheckin.tsx
apps/webapp/src/app/app/patient/home/PatientHomeSosCard.tsx
apps/webapp/src/app/app/patient/home/PatientHomePlanCard.tsx
apps/webapp/src/app/app/patient/home/PatientHomeProgressBlock.tsx
apps/webapp/src/app/app/patient/home/PatientHomeSubscriptionCarousel.tsx
apps/webapp/src/app/app/patient/home/PatientHomeCoursesRow.tsx
```

**Алгоритм для каждого компонента (атомарный шаг = 1 commit):**

1. Прочитать **текущий home-файл** (входы: какие props, типы, импорты).
2. Прочитать **visual+WIP эталон**:
   ```bash
   git show backup/visual-with-dirty-2026-04-29:<path>
   ```
3. Извлечь из visual: JSX-структуру, классы (`patientHomeCardSuccessClass`, etc.), иконки (`lucide-react`), бейджи, layout.
4. Применить в home-файле:
   - **Сохранить:** existing props/types, data-flow, conditional rendering для guest/personal-tier, ссылки `routePaths`, форматирование (например `formatReminderScheduleLabel`).
   - **Заменить:** обёртки (`patientHomeCardClass` → `patientHomeCardSuccessClass` etc.), добавить иконки, применить spec-цвета/токены.
5. Убедиться, что используемые `patientButton*Class` импортированы из `@/shared/ui/patientVisual`.
6. Запустить `pnpm typecheck && pnpm --dir apps/webapp run test src/app/app/patient/home/<related>.test.tsx 2>/dev/null || pnpm --dir apps/webapp run test`.
7. Если есть существующий тест компонента (`<Name>.test.tsx`) — он может пройти/упасть. Если упадёт по text/aria — обновить тест. Если упадёт по props — **остановиться и не менять props**, перепроверить шаг 4.
8. Commit с сообщением `feat(patient-visual): <ComponentName> — VISUAL_SYSTEM_SPEC §<номер>` (например §10.3 для booking, §10.6 для reminder).

#### Соответствие компонент → §spec

| Компонент | §spec | Tone |
| --- | --- | --- |
| Greeting | §10.1 | Time-of-day prefix (приветствие меняется) |
| DailyWarmupCard | §10.2 | Hero gradient |
| BookingCard | §10.3 | Success-toned (`Card` + green CTA) |
| SituationsRow | §10.4 | Tile grid с CMS asset |
| ProgressBlock | §10.5 | Двухколоночная progress + streak |
| NextReminderCard | §10.6 | Warning-toned (amber) |
| MoodCheckin | §10.7 | Pastel check-in 5 слотов |
| SosCard | §10.8 | Danger-toned (red icon circle) |
| PlanCard | §10.10 | Leading icon + opt progress |
| SubscriptionCarousel | §10.11 | Compact base/badge |
| CoursesRow | §10.12 | Compact base |

⚠️ **Особый случай — Greeting:**
home: `personalizedName?: string`.
visual+WIP: `timeOfDayPrefix, displayName, personalTierOk, subtitle`.
Решение: **расширить home props добавочно**, без удаления `personalizedName`. Пример:

```ts
type Props = {
  personalizedName?: string;
  /** §10.1: time-of-day («Доброе утро/день/вечер»). Если не передан — дефолтное «Здравствуйте». */
  timeOfDayPrefix?: "morning" | "day" | "evening";
  subtitle?: string;
};
```

Затем в `PatientHomeToday.tsx` или `patient/page.tsx` (там где рендерится Greeting) — пробросить `timeOfDayPrefix`, посчитав через `getAppDisplayTimeZone()`. Это **сохраняет** обратную совместимость с любым кодом, который уже использует только `personalizedName`.

⚠️ **Особый случай — MoodCheckin:**
home: использует `useState`, `useRouter`, `toast`, POST в `/api/patient/mood`, отображает `PatientMoodToday | null`.
visual+WIP: тонкая presentational с `onSelect` callback, без backend.
Решение: **оставить home backend wiring**, заменить только JSX (5 кнопок-эмодзи в pastel cards по §10.7).

⚠️ **Особый случай — ProgressBlock:**
home: `practiceTarget, personalTierOk, anonymousGuest, progress: { completed, target, streakDays }`.
visual+WIP: тонкая presentational.
Решение: оставить home props, применить двухколоночный layout по §10.5 (slots для progress bar + streak metric с Flame icon).

⚠️ **Особый случай — SituationsRow:**
home: `chips: ResolvedSituationChip[]` (домен из `patientHomeResolvers`).
visual+WIP: `sections: ContentSectionRow[]`.
Решение: оставить home props (`chips`), применить tile grid по §10.4 на основе `chip.title`, `chip.iconUrl`, `chip.href`.

### Шаг 14 — `PatientHomeToday.tsx` layout по §6.2

Файл: `apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx`.

Применить grid из VISUAL_SYSTEM_SPEC §6.2: mobile single column, desktop dashboard `lg:grid-cols-[3fr_2fr]` с per-block ordering.

Per-block order сохраняется по тому, что resolver возвращает — НЕ хардкодить slug в layout.

Commit: `feat(patient-visual): PatientHomeToday layout — desktop dashboard grid`.

### Шаг 15 — Финальный CI + commit log

- `pnpm install --frozen-lockfile && pnpm run ci`.
- Если зелёно — добавить запись в `docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md` (или `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md`) о финале visual redesign apply.
- Commit log entry: `docs: VISUAL_SYSTEM_SPEC apply complete — log entry`.
- **Не пушить.** Отчитаться пользователю списком commit-сообщений.

## Recovery (если что-то пошло не так на шаге N)

В любой момент:

```bash
git log --oneline                                      # увидеть прогресс
git revert <bad-commit>                                # откатить один шаг
git reset --hard <good-commit-hash>                    # откатить N шагов
git checkout backup/visual-with-dirty-2026-04-29 -- <file>   # достать visual эталон
```

Все изменения изолированы по компонентам — откат любого commit'а не ломает остальные (кроме шагов 1-2 — fundament; они должны идти первыми).

## Acceptance criteria

- [ ] `pnpm run ci` зелёный после **каждого** commit (шаги 1-15).
- [ ] Не удалены: mood-API, practice-API, streak, anonymous-guest detection, treatment-program-instances, course intro pages.
- [ ] `apps/webapp/src/modules/patient-mood/*` и `apps/webapp/src/modules/patient-practice/*` без изменений (`git diff --stat origin/feat/patient-home-cms-editor-uxlift-2026-04-29 -- apps/webapp/src/modules/patient-mood apps/webapp/src/modules/patient-practice` пусто).
- [ ] Не вводилось новых env-переменных.
- [ ] Visual эффект соответствует §10.x по каждой карточке.
- [ ] PatientTopNav рендерится на lg+ в `/app/patient`, `/app/patient/sections/[slug]`, `/app/patient/treatment-programs` и других patient-страницах.
- [ ] Mobile: `max-w-[430px]`, page bg `#F7F8FB`, `PatientBottomNav` на дне.
- [ ] Тесты компонентов (`*.test.tsx`) обновлены под новые тексты/aria, но проверяют ту же семантику.

## Запуск

Подготовка для GPT 5.5 агента:

```
Subagent type: GPT 5.5 (или равноценный с Cursor IDE/Composer)
Task: Apply VISUAL_SYSTEM_SPEC.md по этому документу пошагово.
Branch: feat/patient-home-cms-editor-uxlift-2026-04-29 (текущая локально + origin)
Mode: один commit на шаг, CI после каждого, не пушить.
```

После завершения — пользователь делает review последовательности commit'ов и решает либо `git push`, либо `git revert` отдельных шагов.
