# Phase 3 — Patient Home Primary Blocks

## Цель

Перерисовать верхнюю и наиболее заметную часть `/app/patient` под референсы:

- greeting (с обязательным префиксом времени суток);
- desktop/mobile layout;
- hero `daily_warmup`;
- appointment `booking`;
- quick situations `situations`.

Работать только с уже существующей CMS/runtime-моделью. Не менять данные, таблицы, роуты API, slug logic.

## Recommended model

Composer 2 по умолчанию. Codex 5.3 нужен только если Phase 1/2 не завершены и приходится одновременно чинить foundation/nav. Для чистого redesign этих компонентов Composer 2 должен справиться.

## Branch

Работать только в ветке `patient-app-visual-redesign-initiative`.

## Read first

- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/README.md`
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/MASTER_PLAN.md`
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/01_FOUNDATION_PLAN.md`
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/02_NAVIGATION_PLAN.md`
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/VISUAL_SYSTEM_SPEC.md` sections 4, 6, 8, 9, 10.1–10.4, 11, 12, 14
- `docs/PATIENT_HOME_REDESIGN_INITIATIVE/CONTENT_PLAN.md` (только как редакционный ориентир, не runtime source)
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md`
- референсы из `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/references/` если папка не пустая

## Scope

Allowed files:

- `apps/webapp/src/app/app/patient/home/PatientHomeTodayLayout.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeTodayLayout.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeGreeting.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeToday.tsx` only if props/data composition must change to pass timezone/time-of-day data into greeting
- `apps/webapp/src/app/app/patient/home/PatientHomeToday.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeDailyWarmupCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeDailyWarmupCard.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeBookingCard.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeBookingCard.test.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSituationsRow.tsx`
- `apps/webapp/src/app/app/patient/home/PatientHomeSituationsRow.test.tsx`
- `apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts` if helpers need additions
- shared patient visual helpers from Phase 1
- `docs/PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md`

Do not edit:

- `patient_home_blocks` data logic;
- resolvers/repos/services;
- admin CMS;
- reminders/mood/practice modules;
- secondary home blocks except if layout wrapper affects them trivially;
- `AppShell`/`PatientHeader`/`PatientBottomNav`/`PatientTopNav` (Phase 2).

## Implementation checklist

### Layout

- [ ] Сохранить `PatientHomeTodayLayout` как orchestrator страницы.
- [ ] Сохранить ordering из `filterAndSortPatientHomeBlocks`.
- [ ] Mobile: одна колонка.
- [ ] Desktop: dashboard grid согласно `VISUAL_SYSTEM_SPEC.md`.
- [ ] Не делать hardcoded предположений о наличии блоков.
- [ ] Скрытые/пустые блоки не должны давать "дыры" в сетке.

### Greeting (mandatory time-of-day)

- [ ] Использовать `getAppDisplayTimeZone()` из `apps/webapp/src/modules/system-settings/appDisplayTimezone.ts` для определения текущего часа в TZ приложения.
- [ ] Определить time-of-day prefix:
  - `5:00–11:59` → "Доброе утро"
  - `12:00–17:59` → "Добрый день"
  - `18:00–22:59` → "Добрый вечер"
  - `23:00–4:59` → "Доброй ночи"
- [ ] Greeting title: `${prefix}${name ? ", " + name + "!" : "!"}`.
  - `name` берётся только если `personalTierOk` уже разрешает показывать имя; иначе без имени.
- [ ] Subtitle: starter copy из `VISUAL_SYSTEM_SPEC.md §6` (`Готовы к разминке?` или эквивалент).
- [ ] Передача данных: время вычисляется на сервере в `PatientHomeToday` (server component) и передаётся как prop в `PatientHomeGreeting`. **Не** делать клиентский `new Date()` в `PatientHomeGreeting`, чтобы не получить TZ mismatch.
- [ ] Avatar visual: только initials или нейтральный fallback. Не вводить avatar persistence.
- [ ] `PatientHomeGreeting.test.tsx` (или соответствующий) проверяет:
  - все 4 time-of-day branches (через мок `getAppDisplayTimeZone`/Date);
  - guest без имени;
  - personalTierOk с именем.

### Hero `daily_warmup`

- [ ] Заменить image-on-top на gradient hero:
  - background: `linear-gradient(135deg, #F3F0FF 0%, #EEF2FF 100%)` через patient hero gradient class из Phase 1;
  - border: `--patient-color-primary-soft` или эквивалент;
  - radii: `--patient-hero-radius-mobile` / `--patient-hero-radius-desktop`.
- [ ] Сохранить guest/authenticated link behavior.
- [ ] Сохранить `from=daily_warmup` query.
- [ ] Badge row сверху (категория + длительность).
- [ ] Не выдумывать длительность если поля нет; использовать approved fallback и фиксировать в `LOG.md`.
- [ ] Image справа/снизу при наличии `imageUrl`.
- [ ] Decorative shape fallback при отсутствии image.
- [ ] CTA кнопка `>= 44px`, primary tone.
- [ ] Текст не должен перекрываться image на ширине `320–390px`. Если есть конфликт — уменьшать image, не наводить градиент сверху.

### Booking

- [ ] Конвертировать в success-toned appointment card.
- [ ] Сохранить `bookingHref` и `cabinetHref` логику.
- [ ] Сохранить guest/login CTA behavior.
- [ ] Booking CTA — success button.
- [ ] "Мои записи" — secondary button.
- [ ] Leading calendar icon container (lucide `Calendar` или существующий иконочный примитив).
- [ ] Mobile + desktop layouts оба работают.

### Situations

- [ ] Сохранить CMS-driven контент.
- [ ] Не использовать slug/title-based color mapping.
- [ ] Использовать CMS `imageUrl`/icon asset когда есть.
- [ ] Нейтральный fallback (initials или нейтральный shape) при отсутствии иконки.
- [ ] Horizontal scroll на mobile.
- [ ] Labels помещаются в две строки без поломки layout.
- [ ] Optional `Все ситуации` link добавлять только если route уже существует и продакт хочет его. Не создавать dead link.

### Docs/log

- [ ] Обновить `LOG.md`: что изменено в каждом блоке, что отложено.
- [ ] Зафиксировать missing assets (без image, без длительности).
- [ ] Зафиксировать любой остаточный visual mismatch с референсом.
- [ ] (Опционально) приложить ссылки на скриншоты до/после.

## Tests/checks

Targeted tests:

- `pnpm --dir apps/webapp test -- src/app/app/patient/home/PatientHomeTodayLayout.test.tsx`
- `pnpm --dir apps/webapp test -- src/app/app/patient/home/PatientHomeToday.test.tsx`
- `pnpm --dir apps/webapp test -- src/app/app/patient/home/PatientHomeDailyWarmupCard.test.tsx`
- `pnpm --dir apps/webapp test -- src/app/app/patient/home/PatientHomeBookingCard.test.tsx`
- `pnpm --dir apps/webapp test -- src/app/app/patient/home/PatientHomeSituationsRow.test.tsx`

Если для greeting time-of-day появился отдельный test файл `PatientHomeGreeting.test.tsx`:

- `pnpm --dir apps/webapp test -- src/app/app/patient/home/PatientHomeGreeting.test.tsx`

If TypeScript/React changes are broad:

- `pnpm --dir apps/webapp typecheck`

Do not run root `pnpm run ci`.

## Acceptance criteria

- Hero визуально становится large gradient card с CTA и image/fallback.
- Booking визуально success appointment card.
- Situations используют icon tiles без slug-based цветов.
- Greeting содержит **обязательный** time-of-day prefix через `getAppDisplayTimeZone()`.
- Greeting не делает client-side TZ guess.
- Layout корректно работает с отсутствующими блоками.
- Existing guest/auth behavior preserved.
- Tests updated and targeted checks pass or failures are fixed.
- `LOG.md` updated.

