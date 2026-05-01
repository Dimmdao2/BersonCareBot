# Phase 0 — Inventory

## Goal

Readonly inventory for style transfer only.

Create a precise map of:

- existing patient pages;
- old visual classes/usages;
- shared primitives needed;
- tests/checks per phase;
- places where content/product decisions are needed later and must not be invented now.

## Scope

Read only:

- `apps/webapp/src/app/app/patient/**`
- `apps/webapp/src/shared/ui/patientVisual.ts`
- `apps/webapp/src/app/app/patient/home/patientHomeCardStyles.ts`
- `apps/webapp/src/shared/ui/AppShell.tsx`
- `apps/webapp/src/shared/ui/PatientTopNav.tsx`
- existing tests for patient pages.

## Deliverables

Create:

- `PLAN_INVENTORY.md`

Update:

- `LOG.md`

## Checklist

- [ ] Confirm current branch.
- [ ] Confirm current dirty tree and note unrelated changes.
- [ ] List route groups by phase.
- [ ] Find style debt patterns:
  - [ ] `bg-card`
  - [ ] `rounded-xl`
  - [ ] `rounded-2xl`
  - [ ] `shadow-sm`
  - [ ] generic `Card`
  - [ ] generic `Button`
  - [ ] `buttonVariants`
  - [ ] generic `Badge`
  - [ ] `text-muted-foreground`
- [ ] Identify safe generic primitives to extract.
- [ ] Identify home-specific classes that must not be reused.
- [ ] Identify components shared with non-patient UI.
- [ ] Identify tests by route group.
- [ ] Create phase-by-phase file scope.
- [ ] Create phase-by-phase check commands.
- [ ] Record product/content gaps as deferred.

## Forbidden

- No app-code edits.
- No tests.
- No full CI.
- No plan to change content/copy/flow.

## Acceptance

- `PLAN_INVENTORY.md` exists.
- It clearly says Phase 1 is GO or NO-GO.
- It distinguishes style debt from product/content debt.
- It lists exact files for Phase 1.
