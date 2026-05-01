# MASTER PLAN — Patient App Style Transfer

## 1. Goal

Перенести визуальные стили главной пациента на остальные patient pages без самостоятельного изменения содержания страниц.

Главная пациента уже имеет утверждённый visual system: shell/nav, токены, карточки, buttons, badges, icon circles, text tones. Эта инициатива применяет тот же chrome к существующим страницам, сохраняя их текущую структуру и поведение.

## 2. Non-Negotiable Product Boundary

Агент не решает:

- какие блоки должны быть на странице;
- какие тексты лучше;
- какой порядок секций нужен;
- какие состояния нужны продуктово;
- какие новые данные надо показывать;
- какой flow должен быть в booking/diary/profile.

Если текущая страница выглядит продуктово сырой, агент только переносит стиль существующих элементов и фиксирует product gap в `LOG.md`. Не исправляет его сам.

## 3. Style Transfer Definition

Style transfer means:

- replace generic visual classes with patient visual classes;
- use patient card/background/text/action primitives;
- align spacing/radii/shadows with patient tokens;
- preserve existing DOM meaning where possible;
- preserve existing links, handlers, form actions, fetches, props and data shape;
- keep existing copy untouched unless a class-only edit requires no text change.

Style transfer does not mean:

- redesign;
- content rewrite;
- IA refactor;
- new UX flow;
- new data model;
- "while here" cleanup outside visuals.

## 4. Current Source Primitives

Use current patient implementation as reference:

- `apps/webapp/src/shared/ui/AppShell.tsx`
- `apps/webapp/src/shared/ui/PatientTopNav.tsx`
- `apps/webapp/src/shared/ui/patientVisual.ts`
- `apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts`
- `apps/webapp/src/app/globals.css` under `#app-shell-patient`

Important: `patientHomeCardStyles.ts` contains home-specific geometry. Do not spread fixed heights/grid/hero styles into unrelated pages. Extract only generic style atoms into shared patient primitives.

## 5. Target Primitive Layer

Preferred location:

- extend `apps/webapp/src/shared/ui/patientVisual.ts`, or
- create `apps/webapp/src/shared/ui/patientPrimitives.ts` if size/readability requires it.

Candidate exports:

- `patientCardClass`
- `patientCardCompactClass`
- `patientListItemClass`
- `patientSectionSurfaceClass`
- `patientFormSurfaceClass`
- `patientSectionTitleClass`
- `patientBodyTextClass`
- `patientMutedTextClass`
- `patientEmptyStateClass`
- `patientPillClass`
- `patientPrimaryActionClass`
- `patientSecondaryActionClass`
- `patientDangerActionClass`
- `patientInlineLinkClass`

Names must be semantic. No `v2`, `new`, `tmp`.

## 6. Phase Overview

### Phase 0 — Inventory

Readonly. Build exact style debt map and route/file checklist. No app edits.

Deliverables:

- `PLAN_INVENTORY.md`
- `LOG.md` update
- GO/NO-GO for Phase 1

### Phase 1 — Shared Style Primitives

Create patient-scoped style primitives. Keep compatibility with home code. Do not restyle pages yet except tiny compile-preserving changes.

Deliverables:

- shared style exports;
- targeted checks;
- `LOG.md` update;
- `AUDIT_PHASE_1.md` after audit.

### Phase 2 — Static/Read-Only Pages Style Pass

Apply primitives to lower-risk pages where content is mostly links/cards/articles:

- sections;
- content article CTA surfaces;
- courses catalog cards;
- treatment program cards.

No content changes.

### Phase 3 — Interactive Pages Style Pass

Apply primitives to existing forms/lists/tabs:

- profile;
- notifications;
- reminders;
- diary;
- support/help/purchases/bind-phone as visual wrappers only.

No behavior changes.

### Phase 4 — Booking/Cabinet Style Pass

Apply primitives to booking wizard/cabinet surfaces:

- wizard shell body;
- format/city/service/slot/confirm cards/buttons;
- appointment cards/lists.

No booking logic or Rubitime behavior changes.

### Phase 5 — QA, Docs, Global Audit Prep

Final style QA and docs:

- route matrix;
- visual checklist;
- accessibility smoke;
- targeted tests/lint/typecheck as needed;
- prepare for global audit.

## 7. Audit Gates

Each phase follows:

1. EXEC
2. AUDIT
3. FIX only if mandatory findings exist

Next phase starts only after the previous audit says `NO MANDATORY FIXES` or the fix closes mandatory findings.

Global flow after Phase 5:

1. GLOBAL AUDIT
2. GLOBAL FIX if needed
3. optional final verification

## 8. Testing Policy

Use targeted checks, not full root CI after every step.

Run tests for changed components and interactions. Run `typecheck` when shared TS exports or component props changed. Run webapp lint after substantial style pass.

Full root `pnpm run ci` only:

- before push;
- by explicit user request;
- if repo-level config changed.

## 9. Documentation Policy

Every EXEC/FIX updates `LOG.md`.

Every AUDIT creates:

- `AUDIT_PHASE_0.md` for Phase 0;
- `AUDIT_PHASE_1.md` etc.;
- `GLOBAL_AUDIT.md` for global audit.

If a visual exception is kept because content/design needs product input, record:

- route/component;
- what remains old/inconsistent;
- why it was not changed;
- who should decide later.

## 10. Success Criteria

- Patient style primitives are reusable outside home.
- Targeted patient pages use patient chrome consistently.
- No page content/copy/product structure was invented by the agent.
- No business logic/data/API changes.
- No doctor/admin regression.
- Global audit has no mandatory findings.
