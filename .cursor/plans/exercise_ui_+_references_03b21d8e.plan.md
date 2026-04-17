---
name: Exercise UI + References
overview: "Форма упражнения: медиа сразу под заголовком (названием), до описания. Кабинет врача: раздел «Справочники» и управление reference_categories / reference_items. Исходный текст плана ошибочно указывал «под описанием» — фактический продуктовый порядок зафиксирован ниже."
todos:
  - id: exercise-form-media-order
    content: "Порядок полей в ExerciseForm — название → медиа → описание (и далее по форме)"
    status: completed
  - id: doctor-nav-references
    content: "Пункт «Справочники» в doctorNavLinks + заголовки в doctorScreenTitles"
    status: completed
  - id: references-port-extend
    content: "Расширение ReferencesPort и реализаций (pg + in-memory)"
    status: completed
  - id: doctor-references-actions
    content: "Server actions для справочников (requireDoctorAccess, revalidatePath)"
    status: completed
  - id: doctor-references-pages
    content: "Страницы /app/doctor/references и редактирование категории"
    status: completed
  - id: cache-and-tests
    content: "Сброс кэша справочников на клиенте + unit-тесты порта"
    status: completed
isProject: false
planStatus: completed
completedAt: "2026-04-17"
---

# План: форма упражнения и справочники врача (выполнено)

## Коррекция относительно старого текста плана

В исходном приложенном плане в п.1 было написано «медиа под описанием». **Продуктово верно:** блок выбора медиа располагается **после поля «Название» и до поля «Описание»**.

Реализация: [`apps/webapp/src/app/app/doctor/exercises/ExerciseForm.tsx`](../../apps/webapp/src/app/app/doctor/exercises/ExerciseForm.tsx).

## Проверка остальных пунктов (выполнено в кодовой базе)

- **Меню «Справочники»:** [`apps/webapp/src/shared/ui/doctorNavLinks.ts`](../../apps/webapp/src/shared/ui/doctorNavLinks.ts).
- **Заголовки экранов:** [`apps/webapp/src/shared/ui/doctorScreenTitles.ts`](../../apps/webapp/src/shared/ui/doctorScreenTitles.ts).
- **Порт и хранилища:** [`apps/webapp/src/modules/references/ports.ts`](../../apps/webapp/src/modules/references/ports.ts), реализации в `infra/repos` (в т.ч. `listCategories`, управление строками каталога).
- **UI и actions врача:** [`apps/webapp/src/app/app/doctor/references/`](../../apps/webapp/src/app/app/doctor/references/) — страницы, layout/sidebar, server actions, клиентская таблица при необходимости.
- **Инвалидация кэша клиентских селектов:** [`ReferenceCacheBuster`](../../apps/webapp/src/app/app/doctor/references/[categoryCode]/ReferenceCacheBuster.tsx).

## Примечание

Привязка enum «тип нагрузки» в карточке упражнения к справочнику `load_type` в БД по-прежнему отдельная задача (см. миграции и различие кодов) — это не блокирует администрирование `reference_items` из кабинета врача.
