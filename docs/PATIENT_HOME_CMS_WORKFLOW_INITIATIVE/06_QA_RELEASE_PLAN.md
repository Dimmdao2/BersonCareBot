# 06 - QA AND RELEASE READINESS PLAN

## Goal

Закрыть инициативу: зафиксировать артефакты, пройти целевые проверки, выполнить финальный release barrier (CI) только когда действительно нужно.

## Scope

1. Ensure docs complete:
   - `LOG.md` phase history;
   - `BLOCK_EDITOR_CONTRACT.md`;
   - `ROLLBACK_SQL.md` if migrations were added;
   - audits for phases with code changes.
2. Run targeted checks for final changed scope.
3. Run full CI only for final pre-push/release rehearsal or explicit user request.
4. Prepare final status summary.

## Final Manual QA Checklist

- [ ] Empty `situations` block -> create section inline -> appears in block.
- [ ] Visible empty block warning shown in settings.
- [ ] Missing target repair path works.
- [ ] Section slug rename updates home links.
- [ ] Old section URL redirects to new slug.
- [ ] Mixed block candidate grouping clear.
- [ ] Course/material create return flow preserves context.

## Documentation Checklist

- [ ] `LOG.md` has entries for each phase.
- [ ] audit docs exist for executed phases.
- [ ] rollback docs updated if migrations exist.
- [ ] `docs/README.md` has initiative link.

## Gate Strategy

Phase-level (always):

```bash
pnpm --dir apps/webapp exec vitest run <final changed tests>
pnpm --dir apps/webapp exec tsc --noEmit
pnpm --dir apps/webapp lint
```

Run full CI only in one of these cases:

- explicit user request;
- before push;
- final release rehearsal.

Full CI command:

```bash
pnpm install --frozen-lockfile
pnpm run ci
```

## Out Of Scope

- No deploy.
- No push without explicit user request.
- No new feature scope after final audit.

## Completion Criteria

- All mandatory fixes closed.
- Checks green at required level.
- Final summary is ready for user decision (continue/push/release).

