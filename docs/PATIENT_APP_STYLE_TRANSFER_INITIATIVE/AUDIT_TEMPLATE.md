# AUDIT TEMPLATE — Patient App Style Transfer

Use this format for every phase audit and global audit.

## 1. Verdict

Choose one:

- `PASS`
- `PASS WITH MINOR NOTES`
- `FAIL — MANDATORY FIXES REQUIRED`

## 2. Style-Only Scope Check

Answer explicitly:

- Did content/copy stay unchanged?
- Did page order/structure/flow stay unchanged?
- Did links/routes/query params stay unchanged?
- Did data fetching stay unchanged?
- Did services/repos/API routes/migrations stay untouched?
- Did doctor/admin stay untouched?
- Were patient primitives used instead of one-off styling?
- Did home-specific geometry stay out of unrelated pages?

## 3. Mandatory Fixes

Mandatory fixes are only for:

- style-only boundary violations;
- broken behavior caused by visual markup/class changes;
- obvious accessibility regression;
- missing docs/log required by phase;
- missing or failing targeted check directly relevant to changed files.

Format:

```md
1. [severity] File/path — issue.
   Required fix: exact limited fix.
```

If none:

```md
No mandatory fixes.
```

## 4. Minor Notes

Minor notes are not blockers:

- visual polish;
- product/content gaps deferred to human/product decision;
- optional refactor;
- screenshots not captured unless required.

## 5. Checks Reviewed/Run

List:

- commands run;
- commands intentionally not run and why;
- relevant tests reviewed.

## 6. Route/Component Coverage

List what was audited:

- routes;
- components;
- states if checked.

## 7. Deferred Product/Content Questions

Record anything the agent must not solve:

- unclear page content;
- missing empty-state design;
- copy needing product decision;
- larger UX changes.

## 8. Readiness

For phase audit:

- Ready for next phase: yes/no.
- If no, point to mandatory fixes.

For global audit:

- Ready to close initiative: yes/no.
- If no, point to global mandatory fixes.
