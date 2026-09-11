# Аудит `d75b8f684` — каноническая рамка полей каталогов

## Кандидат и authority

- Candidate: `d75b8f684825015bb364586940603d39a3df70a2` (`wt/doctor-catalog-form-canonical`).
- Base: `b25c0a804554b2b096aabc3458bcd38829c4ad2c`.
- Authority: `docs/_TODO/SAAS_FOUNDATION/EXERCISE_STORE_PLAN.md`, И9 и первый пункт порядка S0в; прямое решение владельца 11.09 не ломать общий `ReferenceMultiSelect`, остальные поля привести к общему каноническому виду, экран плиток не менять.

## Классификация до проверки

| ID  | Классификация                         | Доказательство                                                                                                     |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| A0  | Разовое архитектурное состояние       | Diff и итоговое дерево: существует ли одно общее дерево формы по И9/S0в.                                           |
| 1   | UI-поведение                          | Живой Chromium: раскрытие, добавление, удаление, повторное добавление, save/reopen.                                |
| 2   | Разовое состояние контракта           | Дословное сравнение всех `name="…"` между base и candidate.                                                        |
| 3   | Поведение сохранения                  | Живой Chromium: create каждого типа, заполнение всех доступных полей, reopen и чтение значений.                    |
| 4   | UI-поведение                          | Живой Chromium на архивной и read-only карточках; проверка effective disabled и невозможности открыть мультивыбор. |
| 5   | Визуальное состояние общего примитива | Diff `DoctorField`, полный список импортёров, живой взгляд на settings/payments/audit-log.                         |
| 6   | Разовое визуальное состояние          | Path diff плюс снимки плиток с overlay и после его удаления.                                                       |
| 7   | Разовое состояние scope               | `git diff --name-status` и `git diff --check`.                                                                     |
| 8   | UI-поведение                          | Живой submit пустой формы каждого типа; browser required validation и сохранённый error rendering в diff.          |

Blind kill-set до чтения реализации: вместо одного дерева остаются три копии; меняется/теряется `name`; мультивыбор перестаёт добавлять, удалять или возвращать значения; поле теряется после save/reopen; `fieldset` больше не блокирует вложенные custom controls; `full` меняет ширину старых потребителей; меняются плитки; исчезают required/error states; diff выходит за четыре заявленных файла.

## Результат по пунктам

A0 → **FAIL** → `git diff --name-status d75b8f684^ d75b8f684` показывает изменения трёх самостоятельных форм и `DoctorField.tsx`, но не общее дерево формы и не карту компонентов зоны. `rg -n "export function (Exercise|Recommendation|ClinicalTest)Form" apps/webapp/src/app/app/doctor/{exercises,recommendations,clinical-tests}` по-прежнему находит три независимых дерева. Это не выполняет И9 и первый пункт S0в; кроме того, активный текст И9 прямо запрещает перевод полей на `DoctorField` до чистого выноса дерева.

1 → **PASS** → в упражнении раскрыты «Регион» и «Тип нагрузки», в каждом выбраны два пункта, первый снят и добавлен снова; после create/reopen вернулись обе пары (`Голова`/`ВНЧС`, `Мобилизация`/`Нейродинамика`). Та же последовательность пройдена для «Регион тела» рекомендации и теста; hidden `getAll` после reopen вернул по два UUID. Скриншоты: [`02-exercise-region-expanded.png`](evidence/doctor-catalog-form-canonical-2026-09-11/02-exercise-region-expanded.png), [`03-exercise-load-expanded.png`](evidence/doctor-catalog-form-canonical-2026-09-11/03-exercise-load-expanded.png), [`08-recommendation-region-expanded.png`](evidence/doctor-catalog-form-canonical-2026-09-11/08-recommendation-region-expanded.png), [`12-clinical-region-expanded.png`](evidence/doctor-catalog-form-canonical-2026-09-11/12-clinical-region-expanded.png), [`05-exercise-reopened.png`](evidence/doctor-catalog-form-canonical-2026-09-11/05-exercise-reopened.png).

2 → **PASS** → для каждого файла выполнено `git show d75b8f684^:<path> | rg -o 'name="[^"]+"' | sort` и то же для `git show d75b8f684:<path>`; списки полностью совпали, включая повторы. Exercise: `title`, `tags`, `regionRefIds`, `loadTypes`, `description`, `contraindications`, media/redirect/archive hidden names. Recommendation: `title`, `domain`, `bodyRegionIds`, `quantityText`, `frequencyText`, `durationText`, `bodyMd`, `tags`, media/list hidden names. Clinical test: `title`, `description`, `testType`, `assessmentKind`, `bodyRegionIds`, `clinicalScoringJson`, `scoringEditorMode`, `scoringJsonRaw`, `rawText`, `tags`, media/list hidden names.

3 → **FAIL** → упражнение и клинический тест после create/reopen вернули title, текстовые поля, теги, media, reference-мультивыборы и structured scoring. В рекомендации вернулись title/domain/regions/quantity/frequency/duration/tags/media, но `bodyMd` вернулся пустым. Повторный update воспроизвёл то же: `new FormData(form).get('bodyMd')` и POST содержали `ProbeDescription1789159566746`, затем reload вернул `bodyMd === ''`; поиск архивного каталога `?q=ProbeDescription1789159566746` дал «Нет рекомендаций». До/после: [`09-recommendation-filled.png`](evidence/doctor-catalog-form-canonical-2026-09-11/09-recommendation-filled.png), [`10-recommendation-reopened.png`](evidence/doctor-catalog-form-canonical-2026-09-11/10-recommendation-reopened.png), повторная проверка [`22-recommendation-description-recheck.png`](evidence/doctor-catalog-form-canonical-2026-09-11/22-recommendation-description-recheck.png). Успешные перечитывания: [`05-exercise-reopened.png`](evidence/doctor-catalog-form-canonical-2026-09-11/05-exercise-reopened.png), [`14-clinical-reopened.png`](evidence/doctor-catalog-form-canonical-2026-09-11/14-clinical-reopened.png).

4 → **BLOCKED** → архивная карточка упражнения открыта живьём: `fieldset.disabled === true`, все `16/16` вложенных интерактивных элементов совпали с `:disabled`, клик по обоим мультивыборам сохранил `aria-expanded="false"`; [`15-exercise-archived-disabled.png`](evidence/doctor-catalog-form-canonical-2026-09-11/15-exercise-archived-disabled.png). Read-only карточку открыть невозможно: одноразовая проверка `page.getByText('Базовая библиотека', { exact: true }).count()` вернула `0` и в `view=tiles`, и в `view=list`; platform-элементов в доступном DEV-каталоге нет. Diff сохраняет условие `exercise?.ownerKind === 'platform'` и тот же `fieldset disabled={isArchived || isReadOnly}`, но это не заменяет требуемый live-прогон.

5 → **PASS** → в `DoctorField.tsx` добавлена только ветка `full: 'w-full'`; default `width = 'md'` и `sm/md/lg` не менялись. `rg -l "@/shared/ui/doctor/DoctorField" apps/webapp/src --glob '*.tsx' | sort` просмотрен целиком. На `/app/settings`, `/app/admin/payments`, `/app/admin/audit-log` прежние потребители сохранили класс `max-w-[var(--doctor-field-md,24rem)]`; computed width был `384px` на settings/payments и ширина grid-column `376.65625–376.671875px` в audit-log. Скриншоты: [`18-settings-doctorfield-widths.png`](evidence/doctor-catalog-form-canonical-2026-09-11/18-settings-doctorfield-widths.png), [`19-admin-payments-doctorfield-widths.png`](evidence/doctor-catalog-form-canonical-2026-09-11/19-admin-payments-doctorfield-widths.png), [`20-admin-audit-doctorfield-widths.png`](evidence/doctor-catalog-form-canonical-2026-09-11/20-admin-audit-doctorfield-widths.png).

6 → **PASS** → tile-компоненты отсутствуют в `git diff --name-status d75b8f684^ d75b8f684`; визуально master-list сохранил ту же сетку, размеры и карточки: candidate [`21-exercise-tiles-candidate.png`](evidence/doctor-catalog-form-canonical-2026-09-11/21-exercise-tiles-candidate.png), исходное состояние после снятия overlay [`23-exercise-tiles-baseline-after-restore.png`](evidence/doctor-catalog-form-canonical-2026-09-11/23-exercise-tiles-baseline-after-restore.png). Разница отдельных preview — асинхронная загрузка изображений, не layout.

7 → **PASS** → `git diff --name-status d75b8f684^ d75b8f684` вернул ровно `ExerciseForm.tsx`, `RecommendationForm.tsx`, `ClinicalTestForm.tsx`, `DoctorField.tsx`; `git diff --check d75b8f684^ d75b8f684` завершился с code `0`. Server actions, schema, permissions, ports и tile files не затронуты.

8 → **PASS** → на пустой форме каждого типа submit оставил title `checkValidity() === false`, `validationMessage === 'Please fill out this field.'`, focus перешёл в required title. `displayError`/`role="alert"` и required-атрибуты diff не удаляет. Скриншоты: [`01-exercise-required.png`](evidence/doctor-catalog-form-canonical-2026-09-11/01-exercise-required.png), [`07-recommendation-required.png`](evidence/doctor-catalog-form-canonical-2026-09-11/07-recommendation-required.png), [`11-clinical-required.png`](evidence/doctor-catalog-form-canonical-2026-09-11/11-clinical-required.png).

## Findings

1. **MUST FIX — authority/order violation.** Достижимый сценарий: следующий кабинет вынужден снова копировать одно из трёх деревьев, и изменение поля/подписи расходится между кабинетами. Нарушены И9 и первый обязательный шаг S0в: candidate унифицирует локальные обёртки в трёх копиях, но не создаёт одно дерево с зональной картой.
2. **MUST FIX — описание рекомендации молча теряется.** Достижимый сценарий: доктор вводит описание, сохраняет рекомендацию, открывает её снова и получает пустой редактор; текст отсутствует и в серверном поиске по `bodyMd`. Impact — потеря введённого медицинского/методического содержания. Это воспроизведено на create и update; причинность именно четырёхстрочным structural refactor не установлена, но acceptance candidate не проходит.

Новый автоматизированный UI-тест не создан: §10a запрещает UI/DOM-тесты, а существующие нижние `saveRecommendationCore` → service → repository пути уже явно передают `bodyMd`; тест их текста/аргументов был бы ложным oracle и не поймал бы наблюдённую потерю на границе формы. Дефект зафиксирован прямым live create/update/readback.

## Валидация и уборка

- `pnpm --dir apps/webapp exec eslint src/app/app/doctor/exercises/ExerciseForm.tsx src/app/app/doctor/recommendations/RecommendationForm.tsx src/app/app/doctor/clinical-tests/ClinicalTestForm.tsx src/shared/ui/doctor/DoctorField.tsx` → PASS.
- `pnpm --dir apps/webapp typecheck` → PASS.
- Full CI не запускался: diff локален одному webapp UI-scope, а audit требует live-приёмку, scoped lint и typecheck.
- Для live-прогона exact candidate patch был временно наложен на единственный общий `:5200`. Перед overlay SHA-256 всех четырёх файлов совпал с `d75b8f684^`; после `git apply -R` те же четыре пары SHA-256 снова совпали. Финальный `git diff --exit-code HEAD -- <четыре целевых файла>` завершился с code `0`. Появившийся позднее в общем checkout чужой `DoctorCatalogTitleSortSelect.tsx` в overlay не входил и не изменялся этим аудитом.
- Созданные live-записи переведены в архив: exercise `6a1e2f4f-3ae7-4a6d-9523-3b782f802941`, recommendation `626f9bac-e453-470e-a269-add31a712e27`, clinical test `471e9be8-1f5e-4a99-8cb4-401223648285`.

## Вердикт

**FAIL.** Candidate не выполняет обязательную форму И9/S0в и живьём теряет `bodyMd` рекомендации. Read-only часть disabled-проверки дополнительно остаётся BLOCKED из-за отсутствия platform-элемента в DEV-каталоге.
