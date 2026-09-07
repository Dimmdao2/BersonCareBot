# C3M-04 workspace settings audit — #1098

- Product candidate: `5bee7711abb6ec19e8844bd34cbb3bdcd5435923`
- Audited branch HEAD before auditor changes: `c8449c1fa`
- Authority: `docs/_TODO/SAAS_PRODUCT_UX_INITIATIVE/IMPLEMENTATION_ROADMAP.md`, C3M-04 and its C3M foundation
- Role: `auditor-live`

## Test or look

- Automated behavior: structured parser/version compatibility, validation boundaries, organization scoping,
  atomic multi-setting save/reload, availability/dependency effectiveness.
- Live visual: wording, control layout, Select labels, unavailable/disabled states, responsive behavior, and the
  absence of a duplicate visible Account editor.
- One-time diff/architecture inspection: one canonical settings owner/write path and no preset, tariff/add-on,
  role/profession, or solo/clinic behavior.

## Blind kill-set (written before reading candidate tests or product diff)

1. When structured settings are absent, compatibility silently narrows the workspace instead of showing every
   available module; expected channel defaults are `direct_chat=all`, `patient_symptom_tracking_default=all`, and
   legacy comments/media map `true -> all`, `false|absent -> on_support`.
2. Malformed persisted composition/defaults are accepted or normalized to a broader state instead of failing at
   the canonical accepted parse/write boundary.
3. A repository failure during one workspace save persists only a prefix of modules/defaults/terms; success does
   not reload to the same organization-scoped values.
4. Missing organization context is accepted, or organization A reads/overwrites organization B settings.
5. UI input can effectively enable unavailable functionality; `rehabilitation=off` leaves comments/media effective
   even though their stored child choices must remain unchanged.
6. The canonical settings hub fails to own composition, channel defaults, symptom create-time default, and both
   terminology choices, or Account retains a duplicate visible defaults editor/write path.
7. C3M-04 introduces preset content, tariff/add-on/domain logic, role/profession behavior, or solo/clinic branching.

## Result

**FAIL — one product finding.** The candidate covers the canonical workspace hub, defaults, terminology,
dependencies, atomic write path, organization isolation when an organization is supplied, and removal of the
visible Account duplicate. Its workspace-composition service read still accepts a missing organization context.

### MUST FIX C3M04-A1 — workspace composition read does not require organization context

- Reachable scenario: call the exported service boundary
  `createSystemSettingsService(port).getDoctorWorkspaceComposition()`, as its optional
  `options = {}` signature permits.
- Actual result: it resolves the all-enabled compatibility composition rather than raising
  `SystemSettingsOrgContextRequiredError`.
- Impact: an invocation allowed by the exported signature silently receives the all-enabled compatibility value,
  not the current organization's configuration; the service boundary therefore does not guarantee organization
  scoping.
- Violated requirement: blind kill-set item 4 and C3M-04's organization-scoped canonical workspace settings;
  organization context is mandatory.
- Failing acceptance:
  `apps/webapp/src/modules/system-settings/clinicOwnerSettingsBatch.unit.test.ts`,
  `requires organization context when reading the workspace composition`.
- Exact evidence command:
  `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/clinicOwnerSettingsBatch.unit.test.ts -t "requires organization context when reading the workspace composition"`
  → exit 1, 1 failed; the promise resolved the all-enabled version-1 composition instead of rejecting.

No product fix is included in this audit commit.

## Kill-set disposition

1. **PASS.** Client compatibility projection covers absent structured settings, direct chat `all`, symptom
   `all`, and legacy comments/media `true -> all`, `false|absent -> on_support`.
2. **PASS.** Persisted malformed defaults and malformed canonical writes reject at the parser/write boundary.
3. **PASS.** One four-setting save uses the transactional port, reloads the same organization values, and leaves
   the prior set unchanged on an injected repository failure.
4. **FAIL in part.** A/B read/write isolation passes when context is supplied; the mandatory-context acceptance
   above fails.
5. **PASS.** Unavailable modules cannot become effective through preferences, and rehabilitation OFF makes its
   children ineffective while preserving their stored choices.
6. **PASS.** The settings hub owns composition, channel defaults, symptom default, and both terms. Live Account
   inspection found no old comments/media/workspace editor or write control.
7. **PASS.** Complete candidate diff inspection found no preset, tariff/add-on, profession/role, or solo/clinic
   behavior.

## Production-code fault injections

Every mutation below was temporary, produced the expected red test, and was reverted before validation:

- Changed the direct-chat compatibility default from `all` to `off`.
  `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts -t "projects the accepted channel and symptom compatibility defaults"`
  → 1 failed with `direct_chat: off`.
- Allowed arbitrary strings through the client-default mode guard.
  `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts -t "rejects malformed"`
  → 2 failed: malformed persisted and write-boundary values no longer rejected.
- Replaced the transactional batch with sequential individual upserts and injected failure on the second write.
  `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/clinicOwnerSettingsBatch.unit.test.ts -t "keeps the prior workspace set intact"`
  → 1 failed because a prefix of the new set persisted.
- Ignored upstream module availability in the effective resolver.
  `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts -t "never broadens upstream module availability"`
  → 1 failed because unavailable modules became effective.
- Removed the rehabilitation dependency from `program_comments`.
  `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts -t "turns direct and transitive descendants effective-OFF"`
  → 1 failed because comments/media remained effective.
- Dropped `support_group_label` before route persistence.
  `pnpm --dir apps/webapp exec vitest run src/app/api/admin/settings/route.route.test.ts -t "commits the canonical four-key workspace form once"`
  → 1 failed because the atomic write no longer contained all four groups.

## Live visual inspection

- Isolated ordinary DEV login at `http://127.0.0.1:5210`; the process was stopped after inspection. No settings
  save or database mutation was performed.
- Desktop: exact Playwright expression
  `await page.get_by_role("heading", name="Рабочее пространство", exact=True).count()` returned `1`. Module
  controls, defaults for direct chat/comments/media, symptom create-time default, `Клиенты`, and `Группа`
  are in that canonical settings card. Selects display human labels such as `Для всех` and
  `На сопровождении`, never stored enum values.
- Dependency state: after switching rehabilitation OFF in the unsaved browser state, comments and media became
  visibly disabled and retained their displayed choices.
- Account: the old comments/media defaults and workspace editor are absent; the unrelated SMS fallback remains.
- Responsive check used a 390px viewport. Exact browser expression
  `document.documentElement.scrollWidth === document.documentElement.clientWidth` returned `true`; the
  workspace controls stack in one column with no horizontal overflow.

## Diff and architecture inspection

- Read the complete product diff with
  `git diff fcc3c0447..c8449c1fa -- apps/webapp`, then inspected the accepted C3M-01/C3M-03 foundation and
  existing tests.
- Exact addition scan:
  `git diff --unified=0 fcc3c0447..c8449c1fa -- apps/webapp | rg '^\+[^+]' | rg -n -i '\b(preset|tariff|add[-_ ]?on|profession|solo|role)\b'`
  returned no matches.
- Semantic/lexical follow-up:
  `node /home/dev/brain/tools/code-search.mjs "C3M workspace settings preset tariff add-on profession role solo clinic behavior" --repo bcb -k 20`
  returned foundation/roadmap/general feature references, not candidate implementations.
- Registry/consumer back-reference check:
  `rg -n "doctor_workspace_(composition|client_defaults)|patient_label|support_group_label" apps/webapp/src/modules/system-settings/registry.ts apps/webapp/src/app/app/settings apps/webapp/src/app/app/account apps/webapp/src/app/api/admin/settings`
  confirms the registry and canonical settings/admin route ownership; Account has no new structured workspace
  reference.

## Validation

- Stable green set:
  `pnpm --dir apps/webapp exec vitest run src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts src/modules/system-settings/clinicOwnerSettingsBatch.unit.test.ts src/app/api/admin/settings/route.route.test.ts src/app/app/settings/SettingsForm.ui.test.tsx -t "^(?!.*requires organization context when reading the workspace composition)"`
  → exit 0, 4 files passed, 27 tests passed, 1 acceptance skipped.
- Failing acceptance: exact command and result are recorded in C3M04-A1 above.
- `pnpm --dir apps/webapp typecheck` → exit 0.
- `pnpm --dir apps/webapp exec eslint src/app/api/admin/settings/route.ts src/app/api/admin/settings/route.route.test.ts src/app/app/account/page.tsx src/app/app/settings/SettingsForm.tsx src/app/app/settings/page.tsx src/modules/system-settings/doctorWorkspaceComposition.ts src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts src/modules/system-settings/patientTerms.ts src/modules/system-settings/registry.ts src/modules/system-settings/service.ts src/modules/system-settings/clinicOwnerSettingsBatch.unit.test.ts`
  → exit 0.
- `git diff --check` → exit 0.

## Auditor-owned files

- `apps/webapp/src/modules/system-settings/doctorWorkspaceComposition.unit.test.ts`
- `apps/webapp/src/modules/system-settings/clinicOwnerSettingsBatch.unit.test.ts`
- `apps/webapp/src/app/api/admin/settings/route.route.test.ts`
- `runs/c3m-workspace-settings-audit-5bee7711a.md`
