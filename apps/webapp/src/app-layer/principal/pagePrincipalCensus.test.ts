/**
 * MECHANICAL GATE for the bug class of 19f52fed2 (#1006 / night plan A-5).
 *
 * THE BUG. A layout's `enterWith*` principal does NOT reach a sibling page's async context — Next
 * renders them in separate continuations. A page that relies on a guard only its LAYOUT calls
 * therefore reads with the BOOTSTRAP principal. `choosePoolKindForPrincipal`
 * (`src/infra/db/webappPoolProvider.ts`) routes anything that is not organization/staff/platform to
 * the NONSTAFF pool, and `applySignedDbPrincipal` (`packages/db-principal/src/index.ts`) answers a
 * bootstrap principal with `release_principal_context()` + `RESET ROLE`. The query then runs as the
 * bare `bcb_*_nonstaff_login`, which by design holds almost nothing, and the page 500s with 42501.
 * The fix is NEVER a new GRANT on that login role — it is the anonymous/patient pool identity, and
 * granting it staff or platform tables would destroy the wall the dual-pool design exists to hold.
 * The fix is that the page states its own principal, next to its own read.
 *
 * WHY A TEST AND NOT A REVIEW HABIT. PostgreSQL's log showed this firing ~15 800 times in the
 * retained window. It is invisible in code review because the guard *is* there — one directory up.
 *
 * PATTERN FOLLOWED. This is the source-scanning vitest census already used in this repository:
 * `src/app-layer/principal/bootstrapPrincipal.routeCensus.test.ts` (same directory, same shape —
 * walk the app tree, read sources, assert a rule) combined with the exact-frozen-manifest style of
 * `src/app-layer/guards/doctorLaunchCensus.test.ts` and the frozen counts of
 * `src/middleware/csrfOrigin.test.ts`. No new mechanism is introduced.
 *
 * SCOPE. Page/layout RSC entries only. A `route.ts` handler is the root of its own async context —
 * there is no layout above it to inherit from — so it cannot exhibit this bug; API-boundary
 * authority is already gated by `doctorLaunchCensus.test.ts` and
 * `bootstrapPrincipal.routeCensus.test.ts`.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WEBAPP_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const SRC = path.join(WEBAPP_ROOT, "src");
const APP = path.join(SRC, "app");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, out);
    } else out.push(full);
  }
  return out;
}

/** Comments must not satisfy either rule — 19f52fed2's own doc comments name every function here. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\w])\/\/[^\n]*/g, "$1");
}

const sourceCache = new Map<string, string>();
function read(file: string): string {
  let cached = sourceCache.get(file);
  if (cached === undefined) {
    cached = stripComments(readFileSync(file, "utf8"));
    sourceCache.set(file, cached);
  }
  return cached;
}

function resolveImport(specifier: string, fromFile: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /import\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(file: string): string[] {
  const source = read(file);
  const specifiers = new Set<string>();
  for (const match of source.matchAll(IMPORT_RE)) specifiers.add(match[1]!);
  for (const match of source.matchAll(DYNAMIC_IMPORT_RE)) specifiers.add(match[1]!);
  return [...specifiers]
    .map((specifier) => resolveImport(specifier, file))
    .filter((resolved): resolved is string => resolved !== null);
}

/** A client component never renders a DB read on the server, so it is not part of a page's scope. */
const isClientComponent = (file: string) => /^\s*["']use client["']/.test(read(file));
const isRouteEntry = (file: string) =>
  /(^|\/)(page|layout|default|template|not-found|route)\.tsx?$/.test(file);

/**
 * The webapp's DB chokepoints. `buildAppDeps()` is the DI container every repository hangs off;
 * the rest are the exported entrypoints of `src/infra/db/runWebappSql.ts`, `src/infra/db/client.ts`
 * and `src/app-layer/db/*`.
 */
const DB_ENTRYPOINT_RE =
  /\b(buildAppDeps|getPool|getDrizzle|getWebappSqlDb|runWebappSql|runWebappPgText|runWebappTransaction|runPgPoolPgText)\s*\(/;

/**
 * Everything that puts a NON-bootstrap principal into the CURRENT async context: the guards of
 * `src/app-layer/guards/requireRole.ts` (each one goes through `getCurrentSession()`, which stamps
 * via `stampDbPrincipalFromSession`), their page-level wrappers, and the `enter*`/`run*` primitives
 * of `@bersoncare/db-principal`.
 */
const PRINCIPAL_ESTABLISHERS = [
  "requireSession",
  "requirePatientAccess",
  "requirePatientAccessWithPhone",
  "getOptionalPatientSession",
  "requireDoctorAccess",
  "requireDoctorWorkspaceContext",
  "requireOrganizationWorkspaceContext",
  "requireOrganizationManagementContext",
  "requireOrgBrandingManagementContext",
  "requirePlatformOperationsPage",
  "requireAdminDoctorPage",
  "requireGlobalAdminDoctorPage",
  "requireClinicManagementDoctorPage",
  "requireStaffAccountPage",
  "requireStaffPersonalInstallPage",
  "requireEntitlementForPage",
  "requireEntitlementForRead",
  "getCurrentSession",
  "getCurrentSessionForIdentitySelf",
  "withDoctorWorkspacePrincipal",
  "withOrganizationPrincipal",
  "withExplicitOrganizationPrincipal",
  "withPatientOrganizationPrincipal",
  "enterStaffSecuritySelfPrincipal",
  "runWithStaffSecuritySelfPrincipal",
  "enterPatientReferencePrincipal",
  "runWithDbPrincipal",
  "runWithDbOrganizationPrincipal",
  "enterWithDbOrganizationPrincipal",
  "runWithDbStaffPrincipal",
  "enterWithDbStaffPrincipal",
  "runWithDbPatientPrincipal",
  "enterWithDbPatientPrincipal",
  "runWithDbPlatformPrincipal",
  "enterWithDbPlatformPrincipal",
] as const;
const ESTABLISHER_RE = new RegExp(`\\b(${PRINCIPAL_ESTABLISHERS.join("|")})\\s*\\(`);

/**
 * The repository's existing way for a surface to SAY "I read pre-auth, on purpose"
 * (`src/app-layer/principal/bootstrapPrincipal.ts`, already used by 43 route handlers). It is the
 * escape hatch here too: a deliberate public read declares itself in code, not in a side list.
 */
const EXPLICIT_BOOTSTRAP_RE = /\b(stampBootstrapPrincipal|enterWithDbBootstrapPrincipal|runWithDbBootstrapPrincipal|runWithDbInfraPrincipal)\s*\(/;

const pageEntries = walk(APP)
  .filter((file) => /(^|\/)(page|layout|default|template|not-found)\.tsx$/.test(file))
  .sort();

const rel = (file: string) => path.relative(APP, file);

/**
 * A page's OWN scope: the entry file plus the co-located server modules it imports directly from
 * inside `src/app` — the `loadX()` / `xContext.ts` RSC loaders that pages delegate their reads to
 * and that run in the page's async context. Guards, layouts and client components are excluded.
 */
function pageScope(entry: string): string[] {
  return [
    entry,
    ...importsOf(entry).filter(
      (dep) =>
        dep.startsWith(APP + path.sep) && !isRouteEntry(dep) && !isClientComponent(dep),
    ),
  ];
}

/**
 * The wider attribution used by the second census: walk the whole server-module graph from the
 * entry but STOP at any module that establishes a principal (its own reads are covered by its own
 * stamp). A DB read reached without crossing an establisher is a read that will execute under
 * whatever principal happens to be ambient — bootstrap, for a page whose only guard is its layout's.
 */
function unstampedReadInGraph(entry: string): string | null {
  const seen = new Set<string>();
  const visit = (file: string): string | null => {
    if (seen.has(file)) return null;
    seen.add(file);
    const source = read(file);
    if (ESTABLISHER_RE.test(source) || EXPLICIT_BOOTSTRAP_RE.test(source)) return null;
    if (DB_ENTRYPOINT_RE.test(source)) return path.relative(SRC, file);
    for (const dep of importsOf(file)) {
      if (isClientComponent(dep)) continue;
      const found = visit(dep);
      if (found !== null) return found;
    }
    return null;
  };
  return visit(entry);
}

/**
 * Pages that still reach a DB read through a SHARED module (`@/modules/**`, `@/app-layer/**`) with
 * no principal anywhere on that path — even where the page's own co-located reads are properly
 * stamped (`book/new/slot` stamps its catalog read and still reads the timezone unstamped).
 * Every entry below is a genuinely public, pre-authentication surface, and every read on these
 * paths goes through
 * `modules/system-settings/configAdapter.ts::getConfigValue`, whose `fetchFromDb` swallows the
 * 42501 and falls back to `env` — so these do not 500, they log a denial per anonymous request and
 * render from the env fallback. That is the volume behind the `system_settings` denial counter.
 *
 * They are NOT fixed here on purpose: serving public data needs a public read surface (a separate
 * projection plus a dedicated read-only role), which is night plan item **A-2**, an owner-gated
 * decision — not A-5's "the page states its own principal". Adding a page to this class must be a
 * deliberate, reviewed act, which is what freezing the set enforces.
 */
const PUBLIC_PRE_AUTH_SHARED_READ_PAGES: readonly string[] = [
  // Public specialist-first landing: `getAppBaseUrl()` -> `app_base_url` in `system_settings`.
  "page.tsx",
  // Anonymous clinic booking funnel: `appDisplayTimezone` -> `app_display_timezone`.
  "book/confirm/page.tsx",
  "book/new/confirm/page.tsx",
  "book/new/slot/page.tsx",
  "book/slot/page.tsx",
];

describe("RSC page DB-principal census (night plan A-5, bug class of 19f52fed2)", () => {
  it("recognizes the two shapes of 19f52fed2 and rejects a comment that only names them", () => {
    // Shape 1 (staff page): requireDoctorWorkspaceContext() + withDoctorWorkspacePrincipal().
    expect(ESTABLISHER_RE.test("const ctx = await requireDoctorWorkspaceContext();")).toBe(true);
    expect(ESTABLISHER_RE.test("withDoctorWorkspacePrincipal(ctx, () => deps.x.y())")).toBe(true);
    // Shape 2 (global-admin page): await requireAdminDoctorPage().
    expect(ESTABLISHER_RE.test("await requireAdminDoctorPage();")).toBe(true);
    // A page that only TALKS about the guard is still unstamped.
    expect(ESTABLISHER_RE.test(stripComments("// calls requireAdminDoctorPage() upstream"))).toBe(false);
    expect(DB_ENTRYPOINT_RE.test("const deps = buildAppDeps();")).toBe(true);
  });

  it("makes every page that reads the DB in its own scope stamp its own principal", () => {
    const unstamped: string[] = [];
    for (const entry of pageEntries) {
      const scope = pageScope(entry);
      if (!scope.some((file) => DB_ENTRYPOINT_RE.test(read(file)))) continue;
      const declares = scope.some(
        (file) => ESTABLISHER_RE.test(read(file)) || EXPLICIT_BOOTSTRAP_RE.test(read(file)),
      );
      if (!declares) unstamped.push(rel(entry));
    }
    // A page here reads under the bootstrap principal: it will run as the bare
    // `bcb_*_nonstaff_login` and 42501. Fix it in the PAGE with one of the two shapes of
    // 19f52fed2 — never by granting the nonstaff login role the table it wanted.
    expect(unstamped).toEqual([]);
  });

  it("freezes the census so a new DB-reading page is reviewed, not silently added", () => {
    const readers = pageEntries.filter((entry) =>
      pageScope(entry).some((file) => DB_ENTRYPOINT_RE.test(read(file))),
    );
    expect(pageEntries).toHaveLength(173);
    expect(readers).toHaveLength(88);
  });

  it("keeps the deliberately public pre-auth read set exact", () => {
    const viaSharedModule = pageEntries
      .filter((entry) => unstampedReadInGraph(entry) !== null)
      .map(rel)
      .sort();
    expect(viaSharedModule).toEqual([...PUBLIC_PRE_AUTH_SHARED_READ_PAGES].sort());
  });
});
