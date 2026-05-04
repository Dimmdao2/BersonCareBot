# LOG — Patient App Shadcn Alignment

## 2026-05-04 — Phase 3: FeatureCard on shadcn `Card`

- Agent/model: Composer (Cursor).
- Scope: `MASTER_PLAN.md` Phase 3 — только [`FeatureCard.tsx`](../../apps/webapp/src/shared/ui/FeatureCard.tsx) + тесты; страницы [`sections/page.tsx`](../../apps/webapp/src/app/app/patient/sections/page.tsx), [`sections/[slug]/page.tsx`](../../apps/webapp/src/app/app/patient/sections/[slug]/page.tsx), [`PatientHomeLessonsSection.tsx`](../../apps/webapp/src/app/app/patient/home/PatientHomeLessonsSection.tsx) **не редактировались** (контракт прежний).
- Реализация: корень веток на компоненте `Card` из `@/components/ui/card`; `patientCardClass` + overrides `!gap-0 !py-0 ring-0 text-base` чтобы убрать дефолтный chrome Card и сохранить patient surface; без `CardContent` (лишние горизонтальные отступы не нужны). Заблокировано / без href: `Card` с `role="article"` и `id`. Две ссылки: `Card` + два `Link`. Одна ссылка: `Link` с `id` оборачивает `Card` (как раньше кликабельная область).
- Заголовок остаётся **`h2`** (не `CardTitle`), outline документа не сужается до множества `h3`.
- **Главная «Уроки»:** визуально тот же слой токенов (`patientCardClass`); внутри — `data-slot="card"`. Рекомендуется **локальный визуальный smoke** `/app/patient` (сетка «Уроки», hover) после деплоя/мержа — в автоматизированном прогоне агентом не выполнялся.
- Тесты: расширен [`FeatureCard.test.tsx`](../../apps/webapp/src/shared/ui/FeatureCard.test.tsx); `vitest run` — `FeatureCard.test.tsx`, `page.subscription.test.tsx`, `page.warmupsGate.test.tsx`, `page.slugRedirect.test.tsx` (exit 0).
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
- В [`../APP_RESTRUCTURE_INITIATIVE/`](../APP_RESTRUCTURE_INITIATIVE/README.md): `README.md` (таблица «Что в этой папке», §связанные документы — уже были; добавлена строка таблицы), `LOG.md` (cross-init запись), `ROADMAP_2.md` §связанные документы.

## 2026-05-04 — Phase 0 inventory (readonly)

- Agent/model: Composer (Cursor).
- Scope: `MASTER_PLAN.md` Phase 0 — inventory only; no application code changes.
- Actions:
  - Listed all files in `apps/webapp/src/components/ui/` (17); confirmed **no** `accordion` / `collapsible` wrappers in repo.
  - Verified `@base-ui/react@1.3.0` (webapp) exports `accordion` and `collapsible` — no extra npm dependency needed for Phase 1 wrappers.
  - Re-read `apps/webapp/src/components/ui/button.tsx`: `Button` wraps `@base-ui/react/button` + `buttonVariants`; **no `asChild`**.
  - Enumerated **47** patient files under `app/app/patient/**` that import `@/components/ui/*` (full list in `TASKS.md`).
  - Grepped raw `<button>`, `<input>`, `<textarea>`, `<select>` in patient tree; mapped realistic migration candidates to phases (cabinet, profile accordion, notifications, support, diary; intake/home/courses deferred or out of scope per plan).
  - Noted `FeatureCard` consumers: `sections/page.tsx`, `sections/[slug]/page.tsx`, `home/PatientHomeLessonsSection.tsx` (shared component touches home).
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

