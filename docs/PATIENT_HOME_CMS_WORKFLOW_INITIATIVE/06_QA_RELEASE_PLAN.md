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

> **Phase 6 EXEC (2026-04-29):** пункты ниже не прогонялись в headless CI; это операторский gate перед push/release. Индикативное покрытие автотестами см. примечания.

- [ ] Empty `situations` block -> create section inline -> appears in block. *(см. `actions.test.ts` / `patientHomeBlockEditor.test.tsx` для action и UI-фрагментов)*
- [ ] Visible empty block warning shown in settings. *(см. превью/копирайт в `patientHomeBlockEditor.test.tsx`, `blockEditorMetadata.test.ts`)*
- [ ] Missing target repair path works. *(Phase 2: repair UI/заглушки; полный персистентный repair — вне закрытия Phase 6 EXEC)*
- [ ] Section slug rename updates home links. *(см. `pgContentSections.test.ts`, `actions.test.ts` разделов)*
- [ ] Old section URL redirects to new slug. *(см. `page.slugRedirect.test.tsx`, `resolvePatientContentSectionSlug.test.ts`)*
- [ ] Mixed block candidate grouping clear. *(см. `patientHomeBlockEditor.test.tsx`)*
- [ ] Course/material create return flow preserves context. *(см. `patientHomeCmsReturnUrls.test.ts`, `ContentForm.test.tsx`; зазор `sections/new` без return-context — `AUDIT_PHASE_5.md` §5.1)*

## Documentation Checklist

Закрыто в **Phase 6 EXEC (2026-04-29)**.

- [x] `LOG.md` has entries for each phase.
- [x] audit docs exist for executed phases (`AUDIT_PHASE_0.md` … `AUDIT_PHASE_6.md`; см. **Phase 6 — AUDIT** в `LOG.md`).
- [x] rollback docs updated if migrations exist (`ROLLBACK_SQL.md` для миграции `0008` / rename slug).
- [x] `docs/README.md` has initiative link (блок Patient Home CMS Workflow).

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

**Phase 6 EXEC (2026-04-29):** документированный статус — см. `LOG.md` §Phase 6 — EXEC; full root CI **не** запускался (не запрошен пользователем, не перед push, не release rehearsal). Перед push: `pnpm install --frozen-lockfile && pnpm run ci` по §Gate Strategy.

