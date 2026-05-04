# LOG — Patient App Shadcn Alignment

## 2026-05-05 — архив инициативы; Phase 7 как отдельный пакет отменён

- **Решение:** папка `docs/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/` перенесена в **`docs/archive/2026-05-initiatives/PATIENT_APP_SHADCN_ALIGNMENT_INITIATIVE/`**. Phases 0–6 остаются каноном выполненной работы; бывший Phase 7 **не ведётся одним блоком** — дальнейшие UI-проходы по отложенным маршрутам и экранам — **в рамках соответствующих мини-инициатив** с правилами из [`ROADMAP_2.md`](../../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md) §1 (shadcn/shared).
- **Доки:** обновлены [`README.md`](README.md), [`MASTER_PLAN.md`](MASTER_PLAN.md) §Phase 7, [`TASKS.md`](TASKS.md); [`APP_RESTRUCTURE_INITIATIVE/README.md`](../../APP_RESTRUCTURE_INITIATIVE/README.md), [`ROADMAP_2.md`](../../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md), [`APP_RESTRUCTURE_INITIATIVE/LOG.md`](../../APP_RESTRUCTURE_INITIATIVE/LOG.md), корневой [`docs/README.md`](../../README.md).

## 2026-05-04 — Phase 6: form controls (patient)

- Agent/model: Composer (Cursor).
- **Support:** [`PatientSupportForm.tsx`](../../../apps/webapp/src/app/app/patient/support/PatientSupportForm.tsx) — сообщение на [`Textarea`](../../../apps/webapp/src/components/ui/textarea.tsx).
- **Дневник:** [`LfkSessionForm.tsx`](../../../apps/webapp/src/app/app/patient/diary/lfk/LfkSessionForm.tsx) — мультивыбор комплекса: [`Select`](../../../apps/webapp/src/components/ui/select.tsx) + hidden `complexId`; [`QuickAddPopup.tsx`](../../../apps/webapp/src/app/app/patient/diary/QuickAddPopup.tsx) — то же для симптома/ЛФК; **монтирование FAB** на [`diary/page.tsx`](../../../apps/webapp/src/app/app/patient/diary/page.tsx) (`trackings`/`complexes` с сервера). [`SymptomTrackingRow.tsx`](../../../apps/webapp/src/app/app/patient/diary/symptoms/SymptomTrackingRow.tsx) — тип записи: `Select`. [`SymptomsJournalClient.tsx`](../../../apps/webapp/src/app/app/patient/diary/symptoms/journal/SymptomsJournalClient.tsx) / [`LfkJournalClient.tsx`](../../../apps/webapp/src/app/app/patient/diary/lfk/journal/LfkJournalClient.tsx) — фильтр журналов: `Select` (навигация через `router.push`, без POST); редактор ЛФК — комментарий через `Textarea`.
- **Профиль:** [`DiaryDataPurgeSection.tsx`](../../../apps/webapp/src/app/app/patient/profile/DiaryDataPurgeSection.tsx) — согласие на удаление: [`Switch`](../../../apps/webapp/src/components/ui/switch.tsx) + `Label`. [`AuthOtpChannelPreference.tsx`](../../../apps/webapp/src/app/app/patient/profile/AuthOtpChannelPreference.tsx) — канал OTP: новый [`radio-group.tsx`](../../../apps/webapp/src/components/ui/radio-group.tsx) (`RadioGroup` / `RadioGroupItem` на `@base-ui/react`).
- **Intake:** [`LfkIntakeClient.tsx`](../../../apps/webapp/src/app/app/patient/intake/lfk/LfkIntakeClient.tsx), [`NutritionIntakeClient.tsx`](../../../apps/webapp/src/app/app/patient/intake/nutrition/NutritionIntakeClient.tsx) — `Textarea` / `Input` вместо сырого HTML.
- Контракты `FormData` и server actions не менялись; копирайт и правила валидации — без изменений.
- **Журналы фильтров:** нативный `<select>` заменён на `Select` только как controlled navigation (см. [`SymptomsJournalClient.tsx`](../../../apps/webapp/src/app/app/patient/diary/symptoms/journal/SymptomsJournalClient.tsx)) — отдельного `name` в POST нет.
- Checks: `pnpm run typecheck` в `apps/webapp` (exit 0); финал — корневой `pnpm run ci` после док-обновлений; ручной smoke целевых экранов — ок (оператор, 2026-05-04).
- Доки: [`TASKS.md`](./TASKS.md), [`MASTER_PLAN.md`](./MASTER_PLAN.md), [`README.md`](./README.md), [`AUDIT_RESULTS.md`](./AUDIT_RESULTS.md) (§profile, diary, support, deferred); cross-init: [`APP_RESTRUCTURE_INITIATIVE/LOG.md`](../../APP_RESTRUCTURE_INITIATIVE/LOG.md).

## 2026-05-04 — Phase 5: `ChannelNotificationToggles` → `Switch`

- Agent/model: Composer (Cursor).
- [`ChannelNotificationToggles.tsx`](../../../apps/webapp/src/app/app/patient/notifications/ChannelNotificationToggles.tsx): raw `<input type="checkbox">` заменён на [`Switch`](../../../apps/webapp/src/components/ui/switch.tsx) (`checked`, `onCheckedChange`, `disabled={pending}`); `useTransition` + `setChannelNotificationEnabled` + отображение ошибки без изменений по смыслу; `aria-label` на переключателе (`Уведомления: {title}`).
- Тесты: [`ChannelNotificationToggles.test.tsx`](../../../apps/webapp/src/app/app/patient/notifications/ChannelNotificationToggles.test.tsx); инфра: в [`vitest.setup.ts`](../../../apps/webapp/vitest.setup.ts) — полифилл `PointerEvent` для jsdom (Base UI Switch; только если есть `MouseEvent`, чтобы Node-сьюты без jsdom не ломались).
- Checks: eslint на изменённых файлах; `pnpm run typecheck` в `apps/webapp`; vitest — `ChannelNotificationToggles.test.tsx`, `parseChannelPreferenceInput.test.ts`.

## 2026-05-04 — Docs sync: Phase 4 + cross-links (AUDIT_RESULTS, APP_RESTRUCTURE)

- Обновлены [`AUDIT_RESULTS.md`](./AUDIT_RESULTS.md) §`/app/patient/profile` и §рекомендуемый порядок (Phase 4 закрыта); [`MASTER_PLAN.md`](./MASTER_PLAN.md) — working definitions **на момент синка** (Phase 2–4 на экранах) и компактный блок Phase 4; **охват экранов Phase 2–5** — в текущем `MASTER_PLAN` и в записи «Phase 5» того же дня *(полный охват Phase 2–6 — см. запись «Phase 6» в начале этого файла и актуальный `MASTER_PLAN`)*; [`TASKS.md`](./TASKS.md) — frozen scope; [`APP_RESTRUCTURE_INITIATIVE/README.md`](../../APP_RESTRUCTURE_INITIATIVE/README.md), [`ROADMAP_2.md`](../../APP_RESTRUCTURE_INITIATIVE/ROADMAP_2.md), [`APP_RESTRUCTURE_INITIATIVE/LOG.md`](../../APP_RESTRUCTURE_INITIATIVE/LOG.md).

## 2026-05-04 — Phase 4: Profile `ProfileAccordionSection` → `Collapsible`

- Agent/model: Composer (Cursor).
- Scope: [`ProfileAccordionSection.tsx`](../../../apps/webapp/src/app/app/patient/profile/ProfileAccordionSection.tsx) — убраны `useState` и сырой `<button>`; [`Collapsible`](../../../apps/webapp/src/components/ui/collapsible.tsx) / `CollapsibleTrigger` / `CollapsibleContent` (как в `CabinetPastBookings`); шеврон `group-data-[panel-open]:rotate-180`; `defaultOpen`, `statusIcon`, `id`, patient card surface сохранены; `aria-expanded` с триггера Base UI.
- [`profile/page.tsx`](../../../apps/webapp/src/app/app/patient/profile/page.tsx) — без правок (тот же публичный API компонента).
- Тесты: новый [`ProfileAccordionSection.test.tsx`](../../../apps/webapp/src/app/app/patient/profile/ProfileAccordionSection.test.tsx).
- Checks: `eslint` на изменённых файлах; `pnpm run typecheck` в `apps/webapp` (exit 0).

## 2026-05-04 — Phase 3 replay (план): верификация + тесты + TASKS

- Agent/model: Composer (Cursor).
- Потребители `FeatureCard` в `apps/webapp`: [`sections/page.tsx`](../../../apps/webapp/src/app/app/patient/sections/page.tsx), [`sections/[slug]/page.tsx`](../../../apps/webapp/src/app/app/patient/sections/[slug]/page.tsx); код [`FeatureCard.tsx`](../../../apps/webapp/src/shared/ui/FeatureCard.tsx) соответствует MASTER_PLAN Phase 3 (`Card` / `<article>` / `h3`, без `CardContent`).
- Тесты: дополнены кейсы «без `href`» и `containerId` на корне `Card` при `secondaryHref`; `vitest` — `FeatureCard.test.tsx`, `page.subscription`, `warmupsGate`, `slugRedirect` (exit 0).
- Доки: [`TASKS.md`](./TASKS.md) Phase 3 выровнен с кодом; [`ui.md`](../../../apps/webapp/src/shared/ui/ui.md) — уточнено место использования.

## 2026-05-04 — Docs: архивы и план patient home

- Синхронизированы упоминания удалённого `PatientHomeLessonsSection`: `docs/archive/2026-05-initiatives/PATIENT_HOME_REDESIGN_INITIATIVE/README.md`, `PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/PLAN_INVENTORY.md`, `PATIENT_APP_VISUAL_REDESIGN_INITIATIVE/LOG.md`, `PATIENT_APP_STYLE_TRANSFER_INITIATIVE/AUDIT_PHASE_2.md`, `docs/archive/2026-04-initiatives/FULL_DEV_PLAN/PLATFORM_CONTEXT_REPORT.md`, `docs/archive/FULL_DEV_PLAN_DONE/EXEC/EXEC_H_HOTFIX_UI_AUTH.md`, `docs/archive/FULL_DEV_PLAN_DONE/PLANS/STAGE_04_HOME_AND_APPOINTMENTS/PLAN.md`, `.cursor/plans/phase_3_patient_home_1b1dc5a6.plan.md` — без битых ссылок на файл, зафиксирована дата удаления (2026-05-04).

## 2026-05-04 — Phase 3 follow-up: home «Уроки» + a11y `FeatureCard`

- Agent/model: Composer (Cursor).
- Удалён неиспользуемый `apps/webapp/src/app/app/patient/home/PatientHomeLessonsSection.tsx` — блок «Уроки» на главной не рендерится; при появлении блока собрать заново.
- [`FeatureCard.tsx`](../../../apps/webapp/src/shared/ui/FeatureCard.tsx): ветка без `href` / `locked` — нативный `<article>` с `id` (не `Card` + `role="article"`); заголовок карточки — **`h3`**, чтобы в сетках из нескольких карточек не плодить уровень `h2`.
- Тесты: [`FeatureCard.test.tsx`](../../../apps/webapp/src/shared/ui/FeatureCard.test.tsx) — проверка `heading` level 3 для locked.

## 2026-05-04 — Phase 3: FeatureCard on shadcn `Card`

- Agent/model: Composer (Cursor).
- Scope: `MASTER_PLAN.md` Phase 3 — только [`FeatureCard.tsx`](../../../apps/webapp/src/shared/ui/FeatureCard.tsx) + тесты; страницы [`sections/page.tsx`](../../../apps/webapp/src/app/app/patient/sections/page.tsx), [`sections/[slug]/page.tsx`](../../../apps/webapp/src/app/app/patient/sections/[slug]/page.tsx) **не редактировались** (контракт прежний). ~~`PatientHomeLessonsSection`~~ — на момент Phase 3 не импортировался на главной; файл удалён в follow-up того же дня.
- Реализация: корень интерактивных веток на `Card` из `@/components/ui/card`; `patientCardClass` + overrides `!gap-0 !py-0 ring-0 text-base`; без `CardContent`. Две ссылки: `Card` + два `Link`. Одна ссылка: `Link` с `id` оборачивает `Card`. (В follow-up: locked / без href — `<article>`, заголовок `h3`.)
- Тесты: расширен [`FeatureCard.test.tsx`](../../../apps/webapp/src/shared/ui/FeatureCard.test.tsx); `vitest run` — `FeatureCard.test.tsx`, `page.subscription.test.tsx`, `page.warmupsGate.test.tsx`, `page.slugRedirect.test.tsx` (exit 0).
- Checks: `eslint` на `FeatureCard.tsx` + тест; `pnpm run typecheck` в `apps/webapp` (exit 0).

## 2026-05-04 — Phase 2: Cabinet (`CabinetPastBookings`, `AppointmentStatusBadge`)

- Agent/model: Composer (Cursor).
- Scope: `MASTER_PLAN.md` Phase 2 — только patient cabinet UI; маршруты, copy, API не менялись.
- `CabinetPastBookings.tsx`: `Collapsible` + `CollapsibleTrigger` + `CollapsibleContent` вместо `useState` и сырого `<button>`; `defaultOpen={items.length > 0}`; `aria-expanded` и фокус — поведение Base UI; шеврон `group-data-[panel-open]:rotate-180`.
- `AppointmentStatusBadge.tsx`: статус на `Badge variant="outline"` с прежними tone-классами; `Tooltip` для `cancelled` + причина без изменений по смыслу.
- `CabinetInfoLinks.tsx` — не трогали.
- Тесты: новые `CabinetPastBookings.test.tsx`, `AppointmentStatusBadge.test.tsx`; прогон вместе с `CabinetActiveBookings.test.tsx`, `CabinetBookingEntry.test.tsx`.
- Checks: `eslint` на изменённых файлах; `pnpm run typecheck` в `apps/webapp`; `vitest run` на четырёх файлах кабинета (exit 0).

## 2026-05-04 — Phase 1: Collapsible + Accordion primitives

- Agent/model: Composer (Cursor).
- Scope: `MASTER_PLAN.md` Phase 1 — UI infrastructure only; **no** patient/doctor/admin route changes.
- Added:
  - `apps/webapp/src/components/ui/collapsible.tsx` — `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` (Base UI `Panel`) wrapping `@base-ui/react/collapsible`.
  - `apps/webapp/src/components/ui/accordion.tsx` — `Accordion`, `AccordionItem`, `AccordionHeader`, `AccordionTrigger`, `AccordionContent` (Base UI `Panel`) wrapping `@base-ui/react/accordion`.
- Dependencies: none (uses existing `@base-ui/react`).
- Checks: `eslint` on new files; `pnpm run typecheck` in `apps/webapp` (exit 0).

## 2026-05-04 — docs: связка с APP_RESTRUCTURE + статусы в README / MASTER_PLAN / AUDIT_RESULTS

- Scope: docs-only; код не менялся.
- Обновлены `README.md` (сводка фаз + ссылка на `APP_RESTRUCTURE`), `MASTER_PLAN.md` (статусы Phase 0–1, working definitions), `AUDIT_RESULTS.md` (дополнение 2026-05-04).
- В [`APP_RESTRUCTURE_INITIATIVE/`](../../APP_RESTRUCTURE_INITIATIVE/README.md): `README.md` (таблица «Что в этой папке», §связанные документы — уже были; добавлена строка таблицы), `LOG.md` (cross-init запись), `ROADMAP_2.md` §связанные документы.

## 2026-05-04 — Phase 0 inventory (readonly)

- Agent/model: Composer (Cursor).
- Scope: `MASTER_PLAN.md` Phase 0 — inventory only; no application code changes.
- Actions:
  - Listed all files in `apps/webapp/src/components/ui/` (17); confirmed **no** `accordion` / `collapsible` wrappers in repo.
  - Verified `@base-ui/react@1.3.0` (webapp) exports `accordion` and `collapsible` — no extra npm dependency needed for Phase 1 wrappers.
  - Re-read `apps/webapp/src/components/ui/button.tsx`: `Button` wraps `@base-ui/react/button` + `buttonVariants`; **no `asChild`**.
  - Enumerated **47** patient files under `app/app/patient/**` that import `@/components/ui/*` (full list in `TASKS.md`).
  - Grepped raw `<button>`, `<input>`, `<textarea>`, `<select>` in patient tree; mapped realistic migration candidates to phases (cabinet, profile accordion, notifications, support, diary; intake/home/courses deferred or out of scope per plan).
  - Noted `FeatureCard` consumers: `sections/page.tsx`, `sections/[slug]/page.tsx`; `PatientHomeLessonsSection` существовал в repo, но не был на живой главной — удалён 2026-05-04.
- Deliverables: updated `TASKS.md` (Phase 0 checklist + tables + frozen Phase 1/2 scope + **GO** for Phase 1).
- **Phase 0 decision: GO** for optional Phase 1 (add `Accordion` / `Collapsible` under `components/ui/` using existing Base UI).
- Checks: `rg` inventories only; no `pnpm` / CI run (docs-only).

## 2026-05-01 — Audit review corrections

- Agent/model: GPT-5.5 (Cursor).
- Scope: docs-only review of initial shadcn alignment audit/plan after checking local UI primitive APIs.
- Corrections: clarified that the project UI primitives are based on `@base-ui/react`; local `Button` is `@base-ui/react/button` + `buttonVariants` and currently has no `asChild`; updated plan/tasks to avoid assuming that API and to route link-like buttons through `Link` + `buttonVariants(...)` / patient action classes or a future adapter.
- App-code changes: none.
- Checks: docs-only; `ReadLints` for touched docs.

## 2026-05-01 — Initiative docs created

- Agent/model: GPT-5.5 (Cursor).
- Scope: docs-only setup for a follow-up shadcn alignment initiative after `PATIENT_APP_STYLE_TRANSFER_INITIATIVE`.
- Source context: Style Transfer `GLOBAL_AUDIT.md`, Style Transfer `LOG.md`, and follow-up discussion about shadcn usage, deferred routes, new patient home, cabinet, sections, profile, notifications, diary/support/intake forms.
- Key conclusion recorded: broad removal of shadcn primitives did **not** happen in Style Transfer; remaining work is a set of optional/targeted alignment passes.
- Files created:
  - `README.md`
  - `MASTER_PLAN.md`
  - `AUDIT_RESULTS.md`
  - `TASKS.md`
  - `LOG.md`
- App-code changes: none.
- Checks: docs-only; no code checks required.

