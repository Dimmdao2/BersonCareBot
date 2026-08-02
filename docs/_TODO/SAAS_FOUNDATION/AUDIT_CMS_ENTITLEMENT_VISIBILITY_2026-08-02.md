# Независимый аудит CMS по тарифной лестнице — 2026-08-02

## Вердикт

**FAIL.** Этап нельзя сливать как готовый: у пациента остаётся прямая страница выключенного CMS, врач теряет
редактор разминок при включённых разминках и выключенном CMS, а два сохранения в режиме «только чтение» обращаются
к данным до обязательного тарифного отказа.

Источник требований: `TARIFFS_PAYMENTS_ADMIN_PLAN.md`, этап 4 и пункт 4.7; дополнительная граница приёмки этапа —
`cms_pages` и `warmups` независимы, состояние берётся через общий `resolveMechanicAccess`.

## Реальные находки

### CMS-1 — пациент открывает прямую страницу раздела выключенного CMS

Достижимый сценарий: у клиники `cms_pages=disabled`, но пациент открывает сохранённую ссылку
`/app/patient/sections/articles`. Страница получает раздел и материалы, но нигде не спрашивает состояние
`cms_pages`: `apps/webapp/src/app/app/patient/sections/[slug]/page.tsx:40-75`. В результате выключатель скрывает не
все пациентские поверхности, как требует пункт 4.7.

Прежний тест был ложнозелёным: в фикстуре отсутствовало `isVisible`, поэтому
`resolvePatientContentSectionSlug` вызывал `notFound()` ещё до проверяемой тарифной двери. После добавления
`isVisible: true` тест воспроизводит обход.

### CMS-2 — разминки врача зависят от CMS

Достижимый сценарий: у клиники `warmups=full_access`, а `cms_pages=disabled`. Врач открывает существующий редактор
разминок, который находится в «Контенте». Страница сначала безусловно требует `cms_pages` и вызывает `notFound()`
на `apps/webapp/src/app/app/doctor/content/page.tsx:18-29`, не доходя до состояния `warmups`. Прямые страницы
создания и редактирования также сначала требуют `cms_pages` (`content/new/page.tsx:34-37`,
`content/edit/[id]/page.tsx:21-24`). Поэтому отдельный тарифный выключатель разминок фактически не независим.

### CMS-3 — два сохранения читают данные до отказа режима «только чтение»

Достижимый сценарий: клиника уже перешла в `cms_pages=read_only`, а в браузере осталась открытая форма. При
сохранении раздела вызывается `contentSections.getBySlug` до тарифной двери
(`content/sections/actions.ts:75-77`, дверь только на строках 106-107). При сохранении страницы сначала вызываются
`contentSections.getBySlug` и `contentPages.listAll` (`content/actions.ts:28-32,94-107`). Для отсутствующего
раздела человек получает «Раздел не найден» вместо обязательного коммерческого отказа. Это нарушает требование
этапа 4 о видимом отказе и позволяет зависеть от работы content-порта до решения общей двери.

## Проверки

- Текущий красный набор: `pnpm --dir apps/webapp exec vitest --run
  'src/app/app/doctor/content/sections/actions.entitlement.unit.test.ts'
  'src/app/app/doctor/content/page.warmupsIndependence.unit.test.tsx'
  'src/app/app/patient/sections/[slug]/page.cmsVisibility.unit.test.tsx'` — красные сценарии CMS-1, CMS-2 и оба
  сценария CMS-3.
- Существующие UI-проверки: `pnpm --dir apps/webapp exec vitest --run --project=ui
  src/app/app/accessLifecycleSurfaces.ui.test.tsx src/app/api/tariffMechanicsRefusals.ui.test.tsx` — зелёные
  `24 passed`; они подтверждают скрытие CMS-кнопок, прямых страниц мутаций и навигации, но не ловят находки выше.
- Контроль чувствительности: временная подмена условия `canManageCms` в `ContentNav.tsx` сделала красным тест
  `keeps CMS lists readable without offering mutations during the read-only ladder step`; подмена полностью
  отменена после прогона.

Продуктовый код в аудите не исправлялся.
