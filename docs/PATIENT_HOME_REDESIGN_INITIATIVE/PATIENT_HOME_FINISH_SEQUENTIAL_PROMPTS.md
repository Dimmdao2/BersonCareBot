# Patient Home Finish — Copy-Paste Runbook

Дата: 2026-04-30.

Рабочая ветка: `feat/patient-home-cms-editor-uxlift-2026-04-29`.

Базовый план: `/home/dev/.cursor/plans/patient-home-visual-hardening_7561e4c8.plan.md`.

Порядок ниже специально сделан как **запуск → аудит → фикс**, без прыжков по файлу.

## Общие правила

- Работай в текущей ветке `feat/patient-home-cms-editor-uxlift-2026-04-29`; новую ветку не создавай.
- Patient navigation не трогай: нижнее меню с `Дневник`, профиль наверху вместо колокольчика.
- Полный root `pnpm run ci` не гоняй в обычных шагах. Полный CI только в шагах `PUSH MILESTONE`.
- После каждого implementation/fix шага делай commit, если есть изменения и targeted checks зелёные.
- Push только в шагах `PUSH MILESTONE`: перед push обязательно `pnpm install --frozen-lockfile && pnpm run ci`.
- Не коммить чужие несвязанные изменения. Перед commit смотри `git status`, `git diff`, `git log -5 --oneline`; добавляй только файлы своего шага.
- После implementation/audit/fix обновляй релевантный LOG:
  - visual home: `docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md`;
  - block icons/CMS: `docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md`.
- Audit steps создают отдельный audit doc, не только сообщение в чате.

---

## 1. Launch — Mechanical Visual Contract

Модель агента: **Composer 2**.

```text
Ты работаешь в репозитории BersonCareBot в текущей ветке feat/patient-home-cms-editor-uxlift-2026-04-29. Новую ветку не создавай.

Задача: выполнить только механический слой Phase 1 из плана /home/dev/.cursor/plans/patient-home-visual-hardening_7561e4c8.plan.md.

Scope:
- apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts
- apps/webapp/src/shared/ui/patientVisual.ts
- безопасные локальные className правки в:
  - PatientHomeSubscriptionCarousel.tsx
  - PatientHomeCoursesRow.tsx
  - PatientHomePlanCard.tsx
  - PatientHomeNextReminderCard.tsx

Что сделать:
1. В patientHomeCardStyles.ts добавить reusable классы/константы для fixed responsive slots:
   - hero slot;
   - booking companion slot;
   - secondary card slot для progress/reminder/mood/SOS/plan;
   - carousel/course item fixed height;
   - fixed media slot;
   - standard title/subtitle clamp classes.
2. Не менять schema, repos, CMS, navigation.
3. В PatientHomeNextReminderCard.tsx убрать технический вывод linkedObjectType из patient UI.
4. Для subscription/courses/plan добавить line-clamp и fixed card/item heights через новые shared classes.
5. Не пытайся решать hero/booking/progress/mood/SOS дизайн-судебно: только подготовь shared contracts и простые безопасные применения.
6. Обнови docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md короткой записью: mechanical visual contract, files changed, targeted checks.

Проверки:
- targeted vitest по затронутым PatientHome* тестам, если они существуют;
- ReadLints/IDE diagnostics по изменённым файлам;
- полный root pnpm run ci НЕ запускать.

Commit:
- Сделай один commit только с файлами этого шага.
- Commit message: "Tighten patient home visual primitives"
- Не push.
```

---

## 2. Audit — Mechanical Visual Contract

Модель агента: **Composer 2**.

```text
Ты работаешь в текущей ветке feat/patient-home-cms-editor-uxlift-2026-04-29. Новую ветку не создавай.

Задача: аудит результата шага "Mechanical Visual Contract". Не делай фиксы в этом шаге, кроме audit doc + LOG.

Проверить:
- patientHomeCardStyles.ts и patientVisual.ts добавили reusable contracts, а не набор одноразовых классов;
- subscription/courses/plan/reminder получили clamp/fixed sizing без изменения логики;
- linkedObjectType больше не светится в patient UI;
- schema/repos/CMS/navigation не тронуты;
- тесты не стали brittle class snapshots.

Выход:
1. Создай/обнови audit doc:
   - docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_VISUAL_MECHANICAL_CONTRACT.md
2. Формат:
   - Verdict: PASS / PASS WITH NOTES / NEEDS FIX.
   - Findings first, ordered by severity.
   - Для каждого finding: file/component, evidence, exact fix.
   - Tests reviewed/run.
3. Обнови docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md.

Проверки:
- full root pnpm run ci НЕ запускать.

Commit:
- Commit message: "Audit patient home visual primitives"
- Не push.
```

---

## 3. Fix — Mechanical Visual Contract

Модель агента: **Composer 2**.

```text
Ты работаешь в текущей ветке feat/patient-home-cms-editor-uxlift-2026-04-29. Новую ветку не создавай.

Задача: закрыть findings из docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_VISUAL_MECHANICAL_CONTRACT.md.

Правила:
- Исправляй только findings из audit doc.
- Не трогай hero/booking/progress/mood/SOS дизайн-судебно, если audit не нашёл явную механическую ошибку.
- Не трогай navigation, schema, CMS.
- Обнови audit doc разделом "Fix follow-up".
- Обнови docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md.

Проверки:
- targeted vitest по затронутым тестам;
- ReadLints/IDE diagnostics;
- полный root pnpm run ci НЕ запускать.

Commit:
- Commit message: "Fix patient home visual primitive audit findings"
- Не push.
```

---

## 4. Launch — Design-Critical Visual Pass

Модель агента: **GPT-5.5 High**.

```text
Ты работаешь в репозитории BersonCareBot в текущей ветке feat/patient-home-cms-editor-uxlift-2026-04-29. Новую ветку не создавай.

Задача: завершить визуально-критичные карточки главной пациента по плану /home/dev/.cursor/plans/patient-home-visual-hardening_7561e4c8.plan.md.

Контекст:
- Спека docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md — рекомендация, но главная цель — приблизить к приложенному референсу.
- Меню/topbar/bottom nav не трогать.
- Блоки должны иметь фиксированные размеры по breakpoint; высота не должна зависеть от CMS-текста, выбранной картинки/иконки, subtitle, guest/full state.

Scope:
- PatientHomeTodayLayout.tsx
- PatientHomeDailyWarmupCard.tsx
- PatientHomeBookingCard.tsx
- PatientHomeSituationsRow.tsx
- PatientHomeProgressBlock.tsx
- PatientHomeMoodCheckin.tsx
- PatientHomeSosCard.tsx
- при необходимости patientHomeCardStyles.ts и patientVisual.ts.

Что сделать:
1. Layout: mobile/tablet/desktop стабильный ритм; desktop top row hero + booking визуально выровнены.
2. Hero: filled/empty одинаковая геометрия; крупнее mobile title; fixed image slot; clamp title/summary; duration/accent заметнее.
3. Booking: CTA не переполняют desktop; fixed action area; guest/no-tier copy не увеличивает карточку.
4. Situations: fixed tile height/icon box/fallback; не hardcode category colors по slug/title.
5. Progress: full/loading/guest/no-tier одной высоты; две зоны progress + streak.
6. Mood: five fixed slots; image/icon size в диапазоне spec; reserved status line.
7. SOS: один основной leading sign; CMS thumbnail не создаёт шум; fixed height/clamp/CTA area.
8. Обнови docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md.

Acceptance:
- 390px выглядит как app reference, не web cards.
- 1280px booking CTA не вылезают.
- Hero empty/filled имеют одинаковую геометрию.
- Mood click не меняет высоту.
- Progress guest/full/loading не меняют высоту.

Проверки:
- targeted vitest по PatientHomeTodayLayout и затронутым PatientHome* тестам;
- ReadLints/IDE diagnostics;
- полный root pnpm run ci НЕ запускать.

Commit:
- Commit message: "Refine patient home visual layout"
- Не push.
```

---

## 5. Audit — Design-Critical Visual Pass

Модель агента: **GPT-5.5 High**.

```text
Ты работаешь в текущей ветке feat/patient-home-cms-editor-uxlift-2026-04-29. Новую ветку не создавай.

Задача: независимый аудит design-critical visual pass. Не делай фиксы в этом шаге, кроме audit doc + LOG.

Важно:
- Навигацию не оценивать как проблему.
- Не называй PASS, если не было реального review по состояниям/ширинам.

Проверить:
- Hero filled/empty, fixed image slot, title/summary clamps.
- Booking desktop CTA на 1024/1280.
- Situations fixed tiles/fallback.
- Progress full/loading/guest/no-tier same height.
- Reminder/Mood/SOS/Plan/Subscription/Courses fixed heights and no data-driven growth.
- Mood click/save не двигает карточку.
- Tests remain semantic, not class snapshots.

Выход:
1. Создай/обнови:
   - docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_VISUAL_DESIGN_CRITICAL.md
2. Формат:
   - Verdict: PASS / PASS WITH NOTES / NEEDS FIX.
   - Findings first, ordered by severity.
   - Для каждого finding: component/file, evidence, risk, exact fix recommendation.
   - Tests reviewed/run.
   - Remaining risks.
3. Обнови docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md.

Проверки:
- full root pnpm run ci НЕ запускать.

Commit:
- Commit message: "Audit patient home visual layout"
- Не push.
```

---

## 6. Fix — Design-Critical Visual Pass

Модель агента: **GPT-5.5 High** для visual/layout findings; **Composer 2** только если findings purely mechanical.

```text
Ты работаешь в текущей ветке feat/patient-home-cms-editor-uxlift-2026-04-29. Новую ветку не создавай.

Задача: закрыть findings из docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_VISUAL_DESIGN_CRITICAL.md.

Правила:
- Исправляй только findings из audit doc.
- Навигацию не трогать.
- Schema/CMS не трогать.
- Если finding требует продуктового решения, оставь residual risk в audit doc/LOG вместо произвольного решения.

Что сделать:
1. Исправь mandatory/major findings.
2. Обнови tests только где поменялась semantics/DOM.
3. Обнови audit doc разделом "Fix follow-up".
4. Обнови docs/PATIENT_HOME_REDESIGN_INITIATIVE/LOG.md.

Проверки:
- targeted vitest по затронутым PatientHome* тестам;
- ReadLints/IDE diagnostics;
- полный root pnpm run ci НЕ запускать.

Commit:
- Commit message: "Fix patient home visual layout audit findings"
- Не push.
```

---

## 7. Push Milestone — Phase 1 Visual

Модель агента: **Composer 2**.

```text
Ты работаешь в текущей ветке feat/patient-home-cms-editor-uxlift-2026-04-29. Новую ветку не создавай.

PUSH MILESTONE.

Задача: стабилизировать и запушить Phase 1 visual.

Что сделать:
1. Проверь git status/diff. Scope должен быть только patient home visual + audit docs + LOG.
2. Убедись, что есть audit docs:
   - docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_VISUAL_MECHANICAL_CONTRACT.md
   - docs/PATIENT_HOME_REDESIGN_INITIATIVE/AUDIT_VISUAL_DESIGN_CRITICAL.md
   - LOG обновлён.
3. Audit verdict не должен быть NEEDS FIX, либо residual risks явно неблокирующие.
4. Запусти targeted tests:
   - pnpm --dir apps/webapp exec vitest run apps/webapp/src/app/app/patient/home
   - если слишком широко/ломается из-за unrelated, сузить до изменённых PatientHome*.test.tsx и записать что запускалось.
5. Исправь только ошибки Phase 1; при изменениях commit:
   - Commit message: "Stabilize patient home visual tests"
6. Перед push:
   - pnpm install --frozen-lockfile
   - pnpm run ci
7. Если barrier зелёный — git push.
8. Если barrier падает из-за unrelated existing issue, не push; зафиксируй точную ошибку и остановись.
```

---

## 8. Launch — Block Icon Data Layer

Модель агента: **Composer 2**.

```text
Ты работаешь в текущей ветке feat/patient-home-cms-editor-uxlift-2026-04-29. Новую ветку не создавай.

Задача: data layer для настраиваемой иконки блока.

Фича:
- Для блоков с одной leading-иконкой нужна CMS-картинка из медиатеки:
  - sos
  - next_reminder
  - booking
  - progress
  - plan
- Хранение per block: patient_home_blocks.icon_image_url nullable text.
- NULL = текущий lucide fallback.

Scope:
- apps/webapp/db/schema/schema.ts или актуальный schema slice;
- apps/webapp/db/drizzle-migrations/<next>_*.sql через drizzle-kit generate, если проект так делает;
- apps/webapp/src/modules/patient-home/ports.ts;
- apps/webapp/src/modules/patient-home/service.ts;
- apps/webapp/src/infra/repos/pgPatientHomeBlocks.ts;
- apps/webapp/src/infra/repos/inMemoryPatientHomeBlocks.ts;
- relevant repo/service tests.

Правила:
- Не добавляй env vars.
- Не пиши raw SQL в module layer.
- Модуль patient-home не должен импортировать infra/db или infra/repos напрямую.
- Не меняй patient_home_block_items.
- Не добавляй icon picker UI.
- Не меняй runtime карточки.

Что сделать:
1. Добавить iconImageUrl в тип PatientHomeBlock.
2. Добавить портовый метод setBlockIcon(code, iconImageUrl | null) или эквивалент.
3. Расширить pg repo и in-memory repo.
4. Добавить миграцию patient_home_blocks.icon_image_url.
5. Обновить data-layer tests.
6. Обновить docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md.

Проверки:
- targeted vitest для modules/patient-home и repos tests;
- полный root pnpm run ci НЕ запускать.

Commit:
- Commit message: "Add patient home block icon storage"
- Не push.
```

---

## 9. Audit — Block Icon Data Layer

Модель агента: **Composer 2**.

```text
Ты работаешь в текущей ветке feat/patient-home-cms-editor-uxlift-2026-04-29. Новую ветку не создавай.

Задача: аудит data layer для block icon. Не делай фиксы, кроме audit doc + LOG.

Проверить:
- patient_home_blocks.icon_image_url nullable text;
- migration не трогает patient_home_block_items;
- no env/settings keys;
- ports/service/repos clean architecture;
- in-memory repo зеркалит pg behavior;
- tests cover read/write/null.

Выход:
1. Создай/обнови:
   - docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_BLOCK_ICON_DATA_LAYER.md
2. Формат:
   - Verdict: PASS / PASS WITH NOTES / NEEDS FIX.
   - Findings first.
   - Tests reviewed/run.
3. Обнови docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md.

Проверки:
- full root pnpm run ci НЕ запускать.

Commit:
- Commit message: "Audit patient home block icon storage"
- Не push.
```

---

## 10. Fix — Block Icon Data Layer

Модель агента: **Composer 2**.

```text
Ты работаешь в текущей ветке feat/patient-home-cms-editor-uxlift-2026-04-29. Новую ветку не создавай.

Задача: закрыть findings из docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_BLOCK_ICON_DATA_LAYER.md.

Правила:
- Исправляй только findings из audit doc.
- Не добавляй UI/runtime.
- Не расширяй scope.
- Обнови audit doc разделом "Fix follow-up".
- Обнови docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md.

Проверки:
- targeted vitest для затронутых modules/repos tests;
- ReadLints;
- полный root pnpm run ci НЕ запускать.

Commit:
- Commit message: "Fix patient home block icon storage audit findings"
- Не push.
```

---

## 11. Launch — Block Icon Admin and Runtime

Модель агента: **Composer 2**.

```text
Ты работаешь в текущей ветке feat/patient-home-cms-editor-uxlift-2026-04-29. Новую ветку не создавай.

Задача: admin + runtime для настраиваемой иконки блоков.

Предусловие:
- Data layer commit уже добавил patient_home_blocks.icon_image_url, port/repo/service.

Scope:
- apps/webapp/src/app/app/settings/patient-home/PatientHomeBlockSettingsCard.tsx;
- apps/webapp/src/app/app/settings/patient-home/actions.ts;
- media picker компоненты, которые уже используются для иконок самочувствия / CMS media. Перед правкой прочитай .cursor/rules/cms-unified-media-picker-layout.mdc;
- apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx;
- PatientHomeBookingCard.tsx;
- PatientHomeProgressBlock.tsx;
- PatientHomeNextReminderCard.tsx;
- PatientHomeSosCard.tsx;
- PatientHomePlanCard.tsx;
- relevant tests.

Фича:
- Whitelist: sos, next_reminder, booking, progress, plan.
- В editor карточке блока показать "Иконка блока" только для whitelist.
- Выбор картинки из медиатеки, как у иконок самочувствия.
- Превью 40x40.
- "Очистить иконку" пишет NULL.
- Runtime: если iconImageUrl есть, внутри existing leading icon container рендерить decorative img; если NULL — текущий lucide fallback.

Важно:
- Не добавляй настройку для situations, daily_warmup, subscription_carousel, courses, mood_checkin.
- Не реформируй общий список CMS-разделов.
- Не меняй nav.
- Не меняй schema, кроме если нужно исправить data-layer commit.
- Не используй env/settings.
- Обнови docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md.

Проверки:
- targeted vitest: settings/admin tests, affected PatientHome* runtime tests, service/action tests если есть;
- ReadLints;
- полный root pnpm run ci НЕ запускать.

Commit:
- Commit message: "Wire patient home block icon picker"
- Не push.
```

---

## 12. Audit — Block Icon Admin and Runtime

Модель агента: **Composer 2**. Используй **GPT-5.5 High** только если нужно отдельно оценивать UX media picker и visual states.

```text
Ты работаешь в текущей ветке feat/patient-home-cms-editor-uxlift-2026-04-29. Новую ветку не создавай.

Задача: аудит admin/runtime для configurable block icons. Не делай фиксы, кроме audit doc + LOG.

Проверить:
- picker показывается только для whitelist: sos, next_reminder, booking, progress, plan;
- используется общий media picker / правила cms-unified-media-picker-layout;
- preview и clear action работают;
- не добавлен picker для situations/daily_warmup/subscription/courses/mood_checkin;
- runtime renders configured image inside existing leading icon container;
- lucide fallback сохраняется при NULL;
- decorative image has empty alt or aria-hidden;
- icon size does not cause layout shift;
- tests cover admin render/clear and runtime fallback/image.

Выход:
1. Создай/обнови:
   - docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_BLOCK_ICON_ADMIN_RUNTIME.md
2. Формат:
   - Verdict: PASS / PASS WITH NOTES / NEEDS FIX.
   - Findings first.
   - Tests reviewed/run.
3. Обнови docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md.

Проверки:
- full root pnpm run ci НЕ запускать.

Commit:
- Commit message: "Audit patient home block icon picker"
- Не push.
```

---

## 13. Fix — Block Icon Admin and Runtime

Модель агента: **Composer 2**.

```text
Ты работаешь в текущей ветке feat/patient-home-cms-editor-uxlift-2026-04-29. Новую ветку не создавай.

Задача: закрыть findings из docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_BLOCK_ICON_ADMIN_RUNTIME.md.

Правила:
- Исправляй только findings из audit doc.
- Не расширяй whitelist.
- Не реформируй общий список CMS-разделов.
- Не меняй navigation.
- Не добавляй env/settings.
- Обнови audit doc разделом "Fix follow-up".
- Обнови docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/LOG.md.

Проверки:
- targeted vitest по affected modules/repos/settings/runtime tests;
- ReadLints;
- полный root pnpm run ci НЕ запускать.

Commit:
- Commit message: "Fix patient home block icon picker audit findings"
- Не push.
```

---

## 14. Push Milestone — Phase 2 Block Icons

Модель агента: **Composer 2**.

```text
Ты работаешь в текущей ветке feat/patient-home-cms-editor-uxlift-2026-04-29. Новую ветку не создавай.

PUSH MILESTONE.

Задача: стабилизировать и запушить Phase 2 block icons.

Что сделать:
1. Проверь git status/diff. Scope должен быть только:
   - patient_home_blocks.icon_image_url migration/schema;
   - patient-home module/repo/service;
   - patient-home settings editor actions/UI;
   - patient home runtime cards;
   - relevant tests;
   - audit docs + LOG.
2. Убедись, что есть audit docs:
   - docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_BLOCK_ICON_DATA_LAYER.md
   - docs/PATIENT_HOME_CMS_WORKFLOW_INITIATIVE/AUDIT_BLOCK_ICON_ADMIN_RUNTIME.md
   - LOG обновлён.
3. Audit verdict не должен быть NEEDS FIX, либо residual risks явно неблокирующие.
4. Запусти targeted tests:
   - modules/patient-home tests;
   - infra repo tests for patient home blocks;
   - settings/patient-home tests;
   - affected PatientHome* tests.
5. Исправь только ошибки Phase 2; при изменениях commit:
   - Commit message: "Stabilize patient home block icons"
6. Перед push:
   - pnpm install --frozen-lockfile
   - pnpm run ci
7. Если barrier зелёный — git push.
8. Если barrier падает из-за unrelated existing issue, не push; зафиксируй точную ошибку и остановись.
```

---

## 15. Optional Final Visual QA Audit

Модель агента: **GPT-5.5 High**.

```text
Ты работаешь в текущей ветке feat/patient-home-cms-editor-uxlift-2026-04-29. Новую ветку не создавай.

Задача: независимый финальный аудит patient home после visual + block icons. По умолчанию не делай правки; сначала дай findings.

Проверить:
- /app/patient на 320, 360, 390, 768, 1024, 1280;
- Hero filled/empty;
- Booking desktop CTA;
- Progress guest/full/loading states;
- Mood after click/save;
- SOS/reminder/booking/progress/plan icon fallback and configured image state;
- Subscription/courses long text;
- Навигацию не оценивать как проблему.

Output:
- Findings first, ordered by severity.
- Для каждого finding: file/component, risk, exact recommendation.
- Не называй PASS, если не было visual QA.
- full root pnpm run ci НЕ запускать.

Commit/push:
- Не коммить и не пушить без отдельной команды пользователя.
```
