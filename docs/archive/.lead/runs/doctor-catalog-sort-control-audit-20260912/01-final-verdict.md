# Независимый аудит контролов каталога — итоговый вердикт

Кандидат: `3e04f4fef` + `d7fb3b6c2` + `3cd486514`.

База committed diff: `5bb602c5ce806a1095cd70c96599ef86c329e70a` — первый родитель
`3e04f4fef` (`git show -s --format='%H%n%P%n%s' 3e04f4fef d7fb3b6c2 3cd486514`).

Итог: **PASS**. Достижимых нарушений owner requirement, repo-rule или регрессий в проверенном scope не найдено.

## Вердикт по пунктам brief

1 → **PASS** → `git diff --name-only 5bb602c5ce806a1095cd70c96599ef86c329e70a..3cd486514 | wc -l`
вернул `10`: только doctor UI/client-файлы. Команда
`git diff --name-only 5bb602c5ce806a1095cd70c96599ef86c329e70a..3cd486514 | rg '(^|/)(actions|action|route)\.(ts|tsx)$|(^|/)db/schema/|(^|/)migrations/|(^|/)deploy/|port|permission|grant|rls'`
не вернула строк: server actions, schema, migrations, deploy, порты и права не затронуты. Полный diff прочитан
командой `git diff --find-renames --find-copies --no-ext-diff --unified=80 5bb602c5ce806a1095cd70c96599ef86c329e70a..3cd486514`;
`git diff --check 5bb602c5ce806a1095cd70c96599ef86c329e70a..3cd486514` — без вывода.

2 → **PASS** → живой проход `xvfb-run -a python3 /tmp/catalog_controls_recheck_20260912.py`, итог в
[`recheck-live-results.json`](./recheck-live-results.json): в упражнениях и рекомендациях `asc.monotonic=true`,
`desc.monotonic=true`, после reload `titleSort=["asc"]`, порядок сохранён, а default дал
`titleSortAbsent=true`. Для всех смен сортировки массивы `clientOnlyRequests` и
`allSortClientOnlyRequests` пусты: document/RSC-навигации и перезапроса списка не произошло. Реализация query-sync:
`apps/webapp/src/shared/ui/doctor/DoctorCatalogTitleSortSelect.tsx:46-56`.

3 → **PASS** → тот же живой проход создал две разные рекомендации, выбрал A → B → A, сохранил A без изменения и
открыл A прямой ссылкой. В `recheck-live-results.json` значения `firstBeforeSwitch`, `firstAfterReturn` и
`firstAfterUnchangedSaveAndDirectReopen` совпадают с текстом A; `secondAfterSwitch` совпадает с текстом B;
`passed=true`. Обе временные записи убраны обратимо: команда зафиксировала для ID
`63c2f8fd-5972-48ce-9765-e887a0dddc03` и `419d7180-3f95-4af4-8184-467c91329c2a` значение `archived=true`.
Скриншот после возврата и прямого открытия: [`recheck-recommendation-return-reopen.png`](./recheck-recommendation-return-reopen.png).
Исправленная инициализация редактора: `apps/webapp/src/app/app/doctor/recommendations/RecommendationForm.tsx:429-443`.

4 → **PASS** → `xvfb-run -a python3 /tmp/catalog_controls_recheck_20260912.py` на viewport `390×844`:
`bottomSheetVisible=true`, `overflowX=false`, выбранный `bodyMd` совпал с ожидаемым. Кадр
[`recheck-recommendations-mobile-sheet-390x844.png`](./recheck-recommendations-mobile-sheet-390x844.png)
сравнён с сохранённым кадром предшественника
[`recommendations-mobile-bottom-sheet-390x844.png`](./recommendations-mobile-bottom-sheet-390x844.png):
полноширинный нижний лист, состав/порядок полей и фиксированный footer с кнопкой сохранения не изменились.

5 → **PASS** → тот же живой проход открыл задачи, расписание и курсы; для каждой страницы
`overflowX=false`, кадры: [`recheck-neighbor-tasks.png`](./recheck-neighbor-tasks.png),
[`recheck-neighbor-schedule.png`](./recheck-neighbor-schedule.png),
[`recheck-neighbor-courses.png`](./recheck-neighbor-courses.png). Для задач измерено
`topGap=0`, `leftGap=0`, `rightGap=0`, `masterGap=0` в `recheck-live-results.json`.
Точечный проход `xvfb-run -a python3 /tmp/bcb_program_dialog_probe.py` по шаблону «Нестабильность ШОП» вернул
`addCount=13`, `dialog=1`; диалог не смещён и не перекрыт:
[`recheck-neighbor-program-item-dialog-open.png`](./recheck-neighbor-program-item-dialog-open.png).

6 → **PASS** → кандидат не добавляет и не меняет автоматизированные тесты:
`git diff --name-only 5bb602c5ce806a1095cd70c96599ef86c329e70a..3cd486514 | rg '\.(test|spec)\.(ts|tsx)$'`
не вернула строк. Fault injection автоматизированного UI-теста неприменима: такой тест прямо запрещён
`AGENTS.md` §10a; классификация предшественника поэтому назначила живой browser-oracle. Новых тестов, которые
могли бы дублировать реализацию или требовать инъекции, в кандидате нет.

## Собственная выборочная перепроверка утверждений предшественника

- **Упражнения ЛФК:** `xvfb-run -a python3 /tmp/catalog_controls_recheck_20260912.py` — asc и desc монотонны,
  порядок меняется; reload сохраняет asc; desktop-геометрия относительно шапки и контейнера:
  `topGap=0`, `leftGap=0`, `rightGap=0`, `masterGap=0`. Кадр:
  [`recheck-exercises-desktop-1440x900.png`](./recheck-exercises-desktop-1440x900.png).
- **Рекомендации:** та же команда — asc и desc монотонны, порядок меняется; reload сохраняет asc;
  desktop-геометрия: `topGap=0`, `leftGap=0`, `rightGap=0`, `masterGap=0`. Кадр:
  [`recheck-recommendations-desktop-1440x900.png`](./recheck-recommendations-desktop-1440x900.png).

Это мои live-измерения, а не перенос чисел из предыдущего отчёта.

## Статическая валидация

- `pnpm --dir apps/webapp exec eslint src/app/app/doctor/clinical-tests/ClinicalTestsPageClient.tsx src/app/app/doctor/exercises/ExercisesPageClient.tsx src/app/app/doctor/lfk-templates/LfkTemplatesPageClient.tsx src/app/app/doctor/recommendations/RecommendationForm.tsx src/app/app/doctor/recommendations/RecommendationsPageClient.tsx src/app/app/doctor/tasks/DoctorTasksPageClient.tsx src/app/app/doctor/test-sets/TestSetsPageClient.tsx src/app/app/doctor/treatment-program-templates/TreatmentProgramTemplatesPageClient.tsx src/shared/ui/doctor/DoctorCatalogTitleSortSelect.tsx src/shared/ui/doctor/catalog/DoctorCatalogPageLayout.tsx` → exit `0`.
- `pnpm --dir apps/webapp run typecheck` → exit `0`.
- Кандидатный runtime `127.0.0.1:5213` после проверки остановлен; общий DEV `127.0.0.1:5200` и его чужой
  workstream не тронуты.

## Tally

`sed -n '/^## Blind kill-set/,$p' .lead/runs/doctor-catalog-sort-control-audit-20260912/00-classification-and-killset.md | rg -c '^- '` → `8` именованных поломок.

**Убито 8 / непойманных 0.**

## НЕ ПРОВЕРЕНО

Пусто.
