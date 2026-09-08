# Auditor-live brief — #1100 guest tenant access correction

## Тест или взгляд

Named-capability shape, migration ownership and declared rights are one-time state and must be audited by inspection,
generator/census output and owner-aware rollback preflight. Guest access semantics are repeatable behavior, but the
confirmed TEST 500 plus the orchestrator's post-landing live retry are the cheapest runtime oracle; add a persistent
test only if an uncovered stable public contract remains after inspecting the existing route and port-context tests.

## Role and authority

You are the single independent auditor-live for the committed candidate based on `7b41c42c1` in branch
`wt/video-guest-tenant-gate-20260908`. Read `AGENTS.md` headings first, then read §1 migration/access rules,
§5, §10a, §10b and §24 in full before acting. Audit is a gate against the owner plan, not a source of scope.

## Source of oracle

The owner plan [`docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md`](../../docs/_TODO/VIDEO_MEETINGS_JITSI_2026-09.md)
requires: «Tariff-часть проходит только через существующий `requireEntitlementForRead/Mutation`; отдельный
tariff-check внутри `video-meetings` service запрещён.» It also requires: «Из Jitsi, JVB и клиента удалены
внешние STUN/TURN, telemetry, callstats, аватары и иные third-party runtime-запросы; ICE endpoints принадлежат
нашему контуру в РФ.» The relevant checklist items are VM-04 and GATE-02; guest access must not disclose private
patient or doctor data.

## Confirmed defect and candidate intent

On TEST, the guest secret resolves the exact organization, then `requireEntitlementForRead` fails before SQL with
`Missing declared webapp port capability: tenant_service`. The organization principal intentionally has no broad
relation capability. Candidate `552c7863f` makes the existing organization-mechanic resolver a named root only for
organization principals, and adds one fixed-key named root for the existing workspace-composition chokepoint.

## Scope

Audit only candidate `552c7863f` and the directly relevant contracts in:

- `apps/webapp/src/infra/repos/pgOrgEntitlements.ts`
- `apps/webapp/src/infra/repos/pgSystemSettings.ts`
- `apps/webapp/db/drizzle-migrations/20260908T135314_video_guest_reads_organization_access.sql`
- `deploy/postgres/privileges/declaration.ts` and its generated artifacts
- `apps/webapp/src/app/api/video-meetings/guest/exchange/route.ts`

Do not change product code. Do not deploy, execute the migration, touch PROD, create a database, or inspect secrets.
You may add only genuinely missing behavioral acceptance tests and one audit artifact. Do not write tests that read
source or SQL text.

## Required audit decisions

1. Prove whether the named mechanic capability preserves the existing entitlement chokepoint and exact-org wall,
   rather than creating a second tariff evaluator or a relation-wide tenant capability.
2. Prove the workspace root returns only the one accepted organization's `doctor_workspace_composition` value
   with the existing global fallback, and cannot read another setting or organization.
3. Perform the §1 migration rights analysis: changed/created objects, owner/runtime roles, required relation/function
   rights, declaration completeness, and absence of GRANT/REVOKE in migration.
4. Apply §5's single-pass rule explicitly. The consolidation candidate is the existing `getByKey` chokepoint and the
   existing `resolveMechanicAccess`; decide whether they were extended correctly. Do not suggest broadening the
   payment-specific settings root merely to avoid this correctly separate data boundary.
5. Run the cheapest relevant static/type/generator/migration preflight checks. The already-observed live 500 is the
   oracle for this correction; do not invent another test if static gates plus later orchestrator live acceptance
   cover the remaining database/runtime behavior.

## Result

Write `docs/audit/video-guest-tenant-gate-2026-09-08.md` with a binary PASS or MUST FIX, concrete reachable impact
for every finding, commands and results, and the migration rights analysis. Commit the audit artifact and any valid
acceptance test before ending the single turn. All temporary fault injections must be reverted. Do not end while a
foreground check is still running.
