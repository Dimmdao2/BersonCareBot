# Независимый аудит — консолидация платформенного каталога/пакетов упражнений — 2026-08-02

## Вердикт

**FAIL.** Продуктовые сценарии человека верны и защищены в глубину (см. ниже), но ветка не проходит обязательный
`typecheck`-гейт — коммит под аудитом ломает `pnpm --dir apps/webapp typecheck`. Полный `pnpm run ci` на этой ветке
красным. Сливать как готовое нельзя, пока это не исправлено.

Источник требований: `docs/_TODO/SAAS_FOUNDATION/TARIFFS_PAYMENTS_ADMIN_PLAN.md`, исполнимый пункт 2 «Каталог и
пакеты упражнений платформы» (раздел «Что является основой, а что переносится выборочно»).

Продукт-коммит под аудитом: `532664035` (`fix: preserve clinic exercise library without platform access`), ветка
`wt/exercise-platform-library`, HEAD аудита — `767baa0ab`.

## Human-path acceptance — проверено

1. **Клиника всегда создаёт/меняет/архивирует/восстанавливает свои упражнения и комплексы.** Подтверждено
   существующим `tariffMechanics.route.test.ts` (`keeps clinic-owned exercise creation, editing, and archiving
   available while the platform library is disabled`) — гейт `requireEntitlementForMutationAction(…,
   'exercise_catalog')` убран из `actionsShared.ts` (`saveDoctorExerciseCore`/`archiveDoctorExerciseCore`/
   `unarchiveDoctorExerciseCore`/`bulkCreateExercisesFromMediaCore`), запись проходит.
2. **Клиника не может изменить платформенные упражнения/комплексы.** Это НЕ держится на убранном тарифном гейте —
   защита независимая, в глубину, на уровне репозитория:
   - `pgLfkExercises.ts:757-882` (`update`/`archive`/`unarchive`) и `pgLfkTemplates.ts` (`update`/`updateExercises`)
     скопированы условием `AND organization_id = ${ORG_ID_EXPR}`. У платформенной строки `organization_id IS NULL`,
     это условие никогда не совпадает → 0 затронутых строк → сервис бросает `*NotFoundError`/«не найден».
   - Дополнительно `actionsShared.ts:290-298` (`saveDoctorExerciseCore`, ветка update) и сам сервис
     `service.ts:69` (`updateExercise`) читают текущую запись через `getById(id)` **без** `includePlatformBase` —
     платформенная запись невидима уже на этом шаге.
   - Написаны и прогнаны два новых поведенческих теста (см. «Проверки»), которые собирают реальный
     `createLfkExercisesService`/`createLfkTemplatesService` с тестовым портом, воспроизводящим именно эту
     org-scoping семантику, и напрямую бьют по `saveDoctorExerciseCore`/`archiveDoctorExerciseCore`/
     `unarchiveDoctorExerciseCore`/`persistLfkTemplateDraft` платформенным id — оба зелёные, порт `update`/
     `archive`/`unarchive`/`updateExercises` ни разу не вызван.
3. **`exercise_catalog` управляет только видимостью/использованием платформенного каталога упражнений;
   `exercise_packages` — только видимостью/использованием платформенных комплексов.** Оба ключа объявлены в
   реестре механик (`org-entitlements/types.ts:56-57`) и оба помечены в `DECLARED_NO_SURFACE`
   (`protectedActionRegistry.ts`) с явной причиной «tariff controls platform-library visibility only». Разделение
   видимости реализовано корректно: `lfk-templates/page.tsx` и `[id]/page.tsx` читают **два независимых**
   `requireEntitlementForReadAction` — `exercise_packages` управляет `includePlatformBase` для
   `listTemplates`/`getTemplate` (видимость платформенных **комплексов**), `exercise_catalog` — для
   `listExercises` (видимость платформенных **упражнений** в редакторе). Раньше был один флаг на оба списка —
   это и есть «недостающая фильтрация», которую должен был добавить пункт плана; она добавлена.
4. **Уже назначенные программы пациента остаются рабочими без изменений.** Проверено чтением, не тестом (ниже
   объяснение почему): `pgTreatmentProgram.ts` резолвит превью и элементы этапа программы условием
   `(owner_kind = 'organization' AND organization_id = $2) OR (owner_kind = 'platform' AND organization_id IS
   NULL)` **безусловно**, без обращения к тарифной механике вообще (строки 205-277 и далее по файлу). Значит уже
   назначенная платформенная механика/упражнение остаётся видимой пациенту и врачу независимо от текущего
   состояния `exercise_catalog`/`exercise_packages`. Живая проверка на TEST не проводилась (вне полномочий этого
   аудита — среда не трогается), это чтение реального пути записи/чтения, не догадка по имени функции.

## Находки

### FIND-1 — `pnpm --dir apps/webapp typecheck` красный (build-breaking)

Коммит `532664035` убрал 4 маппинга `exercise-catalog.*` из `PROTECTED_ACTION_MAPPINGS` в
`protectedActionRegistry.ts`. Тип `ProtectedActionMapping['id']` — это буквальная уния значений `id` реестра
(`as const satisfies`). Убранные id (`'exercise-catalog.save'` и т.д.) выпали из унии, но
`protectedActionRegistryCoverage.unit.test.ts:37` по-прежнему сравнивает `mapping.id === 'exercise-catalog.save'`:

```
src/app-layer/entitlements/protectedActionRegistryCoverage.unit.test.ts(37,51): error TS2367: This comparison
appears to be unintentional because the types '"courses.list" | … | 62 more … | "branding.notification-templates.preview"'
and '"exercise-catalog.save"' have no overlap.
```

`vitest run` не ловит это (ESBuild стирает типы, тест логически проходит — `8 passed`), но `tsc --noEmit` ловит.
Проверено бисекцией: на родительском коммите `9b66b5814` (до фикса) `pnpm typecheck` зелёный; на `532664035` и
на текущем HEAD (`767baa0ab`) — красный с тем же TS2367. Значит это регресс именно этого коммита, не унаследованная
проблема. Полный `pnpm run ci` на этой ветке упадёт на typecheck-шаге.

Влияние: build/CI gate, не поведенческая уязвимость — платформенный контент от этого не страдает (см. находки
выше), но сливать ветку в этом состоянии нельзя ([§9 Full CI gate](../../../AGENTS.md)).

## Проверки (команды и результаты)

- `pnpm --dir apps/webapp typecheck` → **FAIL**, TS2367 в
  `src/app-layer/entitlements/protectedActionRegistryCoverage.unit.test.ts:37` (см. FIND-1). Подтверждено дважды
  (`532664035` и HEAD), и подтверждено зелёным на родителе `9b66b5814`.
- `pnpm --dir apps/webapp exec vitest run src/app-layer/entitlements/protectedActionRegistryCoverage.unit.test.ts`
  → зелёный, `8 passed`.
- `npx tsx apps/webapp/scripts/check-s4-entitlement-coverage.ts` → `S4 entitlement coverage passed: 72 protected
  actions mapped`.
- `pnpm --dir apps/webapp exec vitest run src/app/api/tariffMechanics.route.test.ts` → **24 passed, 1 failed**;
  упавший тест (`refuses creating a CMS section in the warmups cluster`) — **не относится** к этому аудиту:
  подтверждено, что он падает точно так же на родительском коммите `9b66b5814` (до фикса под аудитом), т.е. это
  дефект CMS-механики вне scope пункта 2 плана, не регресс этого коммита.
- `pnpm --dir apps/webapp exec eslint src/app-layer/entitlements/protectedActionRegistry.ts
  src/app-layer/entitlements/protectedActionRegistryCoverage.unit.test.ts src/app/api/tariffMechanics.route.test.ts
  src/app/app/doctor/exercises/actionsShared.ts src/app/app/doctor/lfk-templates/` → чисто, без предупреждений.
- Слепой kill-set (написан аудитором, коммитится вместе с этим отчётом, добавлен в
  `apps/webapp/src/app/api/tariffMechanics.route.test.ts`):
  - `never mutates a platform-owned exercise through the real service, even though the tariff mutation gate no
    longer runs` — собирает реальный `createLfkExercisesService` с тестовым портом, воспроизводящим
    `organization_id = ORG_ID_EXPR`-семантику реального репозитория; бьёт `saveDoctorExerciseCore` (update),
    `archiveDoctorExerciseCore`, `unarchiveDoctorExerciseCore` платформенным id. **PASS**: все три отказывают
    («не найдено»/`invalid`), `port.update`/`archive`/`unarchive` не вызваны ни разу.
  - `never mutates a platform-owned LFK complex template through the real service, even though the tariff mutation
    gate no longer runs` — то же для `persistLfkTemplateDraft` и реального `createLfkTemplatesService`. **PASS**:
    `ok: false, error: 'Шаблон не найден'`, `port.update`/`updateExercises` не вызваны.
  - Оба теста красны без слоя `organization_id`-скоупинга (проверено рассуждением по коду репозитория — не
    подменялся вручную ради контроля чувствительности, так как подмена потребовала бы правки продуктового
    `pgLfkExercises.ts`/`pgLfkTemplates.ts`, что вне полномочий этого аудита; чувствительность теста доказана тем,
    что тестовый порт **specifically** реализует `getById`/`update` с реальной семантикой платформенных строк, и
    без соответствующей проверки внутри сервиса/actions эти же тесты ловят регрессию на уровне отсутствия
    предварительного `getById`).
- Диапазон изменений коммита под аудитом ограничен заявленным scope пункта 2 плана: `protectedActionRegistry.ts`,
  `protectedActionRegistryCoverage.unit.test.ts`, `tariffMechanics.route.test.ts`, `actionsShared.ts`,
  `lfk-templates/{page.tsx,[id]/page.tsx,actions.ts,LfkTemplatesPageClient.tsx}`. Миграции, Track D, DEV/TEST/PROD
  не затронуты.

## Не сделано / вне этого аудита

- Живая проверка на TEST (человек кликает: комплекс/упражнение исчезают из выбора при выключенной механике, ранее
  назначенная программа пациента открывается) — не проводилась, аудитору не разрешено касаться DEV/TEST/PROD.
- FIND-1 не исправлен — продуктовый код и тест не менялись согласно ограничению «не чинить продукт»; фикс — на
  отдельном исполнителе.

Продуктовый код в аудите не исправлялся. Коммитятся только этот отчёт и добавленные аудитом поведенческие тесты
в `apps/webapp/src/app/api/tariffMechanics.route.test.ts`.
