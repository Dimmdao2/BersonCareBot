/**
 * MECHANICAL GATE for the bug class of 19f52fed2 (#1006 / night plan A-5).
 *
 * THE BUG. A layout's `enterWith*` principal does NOT reach a sibling page's async context — Next
 * renders them in separate continuations. A page that relies on a guard only its LAYOUT calls
 * therefore reads with the BOOTSTRAP principal. `choosePoolKindForPrincipal`
 * (`src/infra/db/webappPoolProvider.ts`) routes anything that is not organization/staff/platform to
 * the NONSTAFF pool, and `applySignedDbPrincipal` (`packages/db-principal/src/index.ts`) answers a
 * bootstrap principal with `release_principal_context()` + `RESET ROLE`. The query then runs as the
 * bare `bcb_*_nonstaff_login`, which by design holds almost nothing: the page either 500s with 42501
 * or — worse, see `modules/system-settings/configAdapter.ts` — swallows the denial and serves a
 * DIFFERENT value than the one configured. The fix is NEVER a new GRANT on that login role. The fix
 * is that the code states its own principal, next to its own read.
 *
 * WHY THIS GATE WAS REWRITTEN (2026-07-26). Its first version (bf7e951f7) matched the establisher
 * names with a regular expression over whole files. An independent audit defeated it twice, with
 * all four of its assertions green:
 *
 *   (a) AN IMPORT SATISFIED IT. Seventeen guards are DEFINED under `src/app`, so the page's "own
 *       scope" contained the guard's own definition site and the establisher pattern matched there.
 *       A page that merely IMPORTED a guard passed. So did a page that called it without `await`.
 *   (b) READS OUTSIDE `src/app` WERE INVISIBLE. The read-detection half only looked at files under
 *       `src/app`, and the graph-walking half stopped at any FILE that mentioned an establisher
 *       anywhere in it. `infra/repos/pgAppRuntimeSettings.ts` wraps two of its three query branches
 *       in `runWithDbBootstrapPrincipal` and leaves the third bare — file granularity called the
 *       whole module covered, so a page reaching that bare query was reported as clean.
 *
 * WHAT THIS VERSION CHECKS, AND WHAT IT HONESTLY CANNOT. Establishing a principal is a RUNTIME,
 * per-async-context property; no source scan can decide it. What is decidable is LEXICAL COVERAGE,
 * and that is what this file computes, per CALL SITE, over the TypeScript AST (`typescript` is
 * already a repository dependency — `tsc` runs in CI; no framework is added):
 *
 *   - a read is COVERED if it sits inside the callback argument of a `runWithDb*Principal` /
 *     `with*Principal` wrapper, or after an `await`ed guard / an `enter*` / `stamp*` call in the
 *     same statement list. An IMPORT covers nothing. A call without `await` covers nothing. A
 *     comment covers nothing.
 *   - a read is a call to a SQL executor (`runWebappPgText` & co.) or a method call on the DI
 *     container (`deps.<port>.<method>()`), which is how every repository in this app is reached.
 *     Constructing the container (`buildAppDeps()`) is not a read.
 *   - the walk crosses module boundaries per EXPORTED SYMBOL, not per file, and follows local
 *     helpers too, so `pgAppRuntimeSettings`'s bare branch is no longer hidden by its wrapped ones.
 *
 * Two limits, stated so nobody mistakes this for a proof:
 *   1. It is FUNCTION-granular at the far end. A page that reaches one branch of a multi-branch
 *      exported function is charged with every uncovered branch of it. Over-reports, never under.
 *   2. It cannot see control flow. `getOptionalPatientSession()` is deliberately NOT an establisher
 *      (it returns `null` and stamps NOTHING for an anonymous caller); pages that use it and then
 *      early-return are safe by control flow the analysis cannot read, so they land in the frozen
 *      manifest below rather than being silently accepted.
 * Anything the analysis cannot decide therefore ends up VISIBLE in a frozen manifest, never quietly
 * passed. That is the property this gate really carries: the unprincipled read surface of the RSC
 * page tree cannot grow, shrink or move without this file being edited in the same commit.
 *
 * PATTERN FOLLOWED. The source-scanning vitest census already used in this repository
 * (`src/app-layer/principal/bootstrapPrincipal.routeCensus.test.ts`, same directory) with the
 * exact-frozen-manifest style of `src/app-layer/guards/doctorLaunchCensus.test.ts` and the frozen
 * counts of `src/middleware/csrfOrigin.test.ts`.
 *
 * SCOPE. Page/layout RSC entries only. A `route.ts` handler is the root of its own async context —
 * there is no layout above it to inherit from — so it cannot exhibit this bug; API-boundary
 * authority is already gated by `doctorLaunchCensus.test.ts` and
 * `bootstrapPrincipal.routeCensus.test.ts`.
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const WEBAPP_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const SRC = path.join(WEBAPP_ROOT, "src");
const APP = path.join(SRC, "app");

/**
 * Everything that puts a NON-bootstrap principal into the CURRENT async context and KEEPS it there
 * for the statements that follow: the guards of `src/app-layer/guards/requireRole.ts` (each goes
 * through `getCurrentSession()`, which stamps via `stampDbPrincipalFromSession`), their page-level
 * wrappers, and the `enter*`/`stamp*` primitives of `@bersoncare/db-principal`.
 *
 * A name earns a place here only if it stamps UNCONDITIONALLY. `getOptionalPatientSession` does not
 * (`app-layer/guards/requireRole.ts:54-61` returns `null` for an anonymous caller and stamps
 * nothing) and is listed as CONDITIONAL below instead.
 */
const STATEMENT_ESTABLISHERS = [
  "requireSession",
  "requirePatientAccess",
  "requirePatientAccessWithPhone",
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
  // Page-level wrapper: `app/app/account/accountContext.ts` = requireStaffAccountPage() + context.
  "loadStaffAccountPageContext",
  // Only ever called with an already-resolved session; its own read runs under that session's
  // principal (`app-layer/guards/requireRole.ts:70-82`).
  "patientRscPersonalDataGate",
  "getCurrentSession",
  "getCurrentSessionForIdentitySelf",
  "stampDbPrincipalFromSession",
  "ensureDbPrincipalContext",
  "enterStaffSecuritySelfPrincipal",
  "enterPatientReferencePrincipal",
  "enterWithDbOrganizationPrincipal",
  "enterWithDbStaffPrincipal",
  "enterWithDbPatientPrincipal",
  "enterWithDbPlatformPrincipal",
  // The repository's existing way to SAY "I read pre-auth, on purpose"
  // (`src/app-layer/principal/bootstrapPrincipal.ts`, already used by 43 route handlers).
  "enterWithDbBootstrapPrincipal",
  "stampBootstrapPrincipal",
] as const;

/** Establishers that cover only what runs INSIDE them — their callback argument. */
const WRAPPER_ESTABLISHERS = [
  "withDoctorWorkspacePrincipal",
  "withOrganizationPrincipal",
  "withExplicitOrganizationPrincipal",
  "withPatientOrganizationPrincipal",
  "runWithStaffSecuritySelfPrincipal",
  "runWithDbPrincipal",
  "runWithDbOrganizationPrincipal",
  "runWithDbStaffPrincipal",
  "runWithDbPatientPrincipal",
  "runWithDbPlatformPrincipal",
  "runWithDbBootstrapPrincipal",
  "runWithDbInfraPrincipal",
] as const;

/** Stamps for a logged-in caller, stamps NOTHING for an anonymous one. Never covers. */
const CONDITIONAL_ESTABLISHERS = ["getOptionalPatientSession"] as const;

/** The webapp's SQL executors: `src/infra/db/runWebappSql.ts` and `src/infra/db/client.ts`. */
const SQL_EXECUTORS = new Set([
  "getPool",
  "getDrizzle",
  "getWebappSqlDb",
  "runWebappSql",
  "runWebappPgText",
  "runWebappTransaction",
  "runPgPoolPgText",
]);

/** The DI container every repository hangs off. Building it reads nothing; USING it reads. */
const DI_CONTAINER = "buildAppDeps";
const DI_CONTAINER_VARIABLE = "deps";

const ESTABLISHERS = new Set<string>([...STATEMENT_ESTABLISHERS, ...WRAPPER_ESTABLISHERS]);
const NON_EDGE_NAMES = new Set<string>([
  ...ESTABLISHERS,
  ...CONDITIONAL_ESTABLISHERS,
  ...SQL_EXECUTORS,
  DI_CONTAINER,
]);
const COVERS_REST_OF_BLOCK = new Set<string>(STATEMENT_ESTABLISHERS);

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

const sourceFileCache = new Map<string, ts.SourceFile>();
function parse(file: string, text?: string): ts.SourceFile {
  const cached = sourceFileCache.get(file);
  if (cached && text === undefined) return cached;
  const sf = ts.createSourceFile(
    file,
    text ?? readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  if (text === undefined) sourceFileCache.set(file, sf);
  return sf;
}

const isClientComponent = (file: string) =>
  /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*["']use client["']/.test(readFileSync(file, "utf8"));
const isRouteEntry = (file: string) =>
  /(^|\/)(page|layout|default|template|not-found|route)\.tsx?$/.test(file);

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

function calleeName(node: ts.CallExpression): string | null {
  const expression = node.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.name)) {
    return expression.name.text;
  }
  return null;
}

function enclosingStatement(node: ts.Node): ts.Node | null {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isStatement(current)) current = current.parent;
  return current ?? null;
}

function isAwaited(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isStatement(current)) {
    if (ts.isAwaitExpression(current)) return true;
    current = current.parent;
  }
  return false;
}

type Range = readonly [number, number];

/**
 * The regions of one file in which a principal is already established. Purely lexical, and bounded
 * by the enclosing statement list, so an establisher in one function never covers another.
 */
function coveredRanges(sf: ts.SourceFile): Range[] {
  const ranges: Range[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      if (name !== null && ESTABLISHERS.has(name)) {
        // A wrapper covers what runs inside it.
        for (const argument of node.arguments) ranges.push([argument.getStart(sf), argument.end]);
        // A guard covers the statements that follow it — but only if its result is actually
        // waited for. `requireAdminDoctorPage();` without `await` stamps nothing in time.
        if (COVERS_REST_OF_BLOCK.has(name) && (isAwaited(node) || /^(enter|stamp)/.test(name))) {
          const statement = enclosingStatement(node);
          const parent = statement?.parent;
          const siblings =
            parent && (ts.isBlock(parent) || ts.isSourceFile(parent) || ts.isCaseClause(parent))
              ? parent.statements
              : null;
          const last = siblings?.[siblings.length - 1];
          if (statement && last && last.end > statement.end) ranges.push([statement.end, last.end]);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return ranges;
}

const coveredCache = new Map<string, Range[]>();
function coveredRangesOf(file: string): Range[] {
  let ranges = coveredCache.get(file);
  if (!ranges) {
    ranges = coveredRanges(parse(file));
    coveredCache.set(file, ranges);
  }
  return ranges;
}

type ImportBinding = { file: string; name: string };
const importMapCache = new Map<string, Map<string, ImportBinding>>();
function importsOf(file: string): Map<string, ImportBinding> {
  let map = importMapCache.get(file);
  if (map) return map;
  map = new Map<string, ImportBinding>();
  for (const statement of parse(file).statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    if (statement.importClause.isTypeOnly) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const target = resolveImport(statement.moduleSpecifier.text, file);
    if (!target) continue;
    const clause = statement.importClause;
    if (clause.name) map.set(clause.name.text, { file: target, name: "default" });
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (element.isTypeOnly) continue;
        map.set(element.name.text, {
          file: target,
          name: (element.propertyName ?? element.name).text,
        });
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      map.set(bindings.name.text, { file: target, name: "*" });
    }
  }
  importMapCache.set(file, map);
  return map;
}

const localDeclCache = new Map<string, Map<string, ts.Node>>();
function localDeclarationsOf(file: string): Map<string, ts.Node> {
  let map = localDeclCache.get(file);
  if (map) return map;
  map = new Map<string, ts.Node>();
  for (const statement of parse(file).statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      map.set(statement.name.text, statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) map.set(declaration.name.text, declaration);
      }
    }
  }
  localDeclCache.set(file, map);
  return map;
}

/** The declarations that `import { name }` / the module entry actually refers to. */
function rootsFor(file: string, exportName: string | null): ts.Node[] {
  const sf = parse(file);
  if (exportName === null || exportName === "*") return [sf];
  const roots: ts.Node[] = [];
  for (const statement of sf.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      const isDefault = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      if (statement.name?.text === exportName || (exportName === "default" && isDefault)) {
        roots.push(statement);
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === exportName) {
          roots.push(declaration);
        }
      }
    } else if (ts.isClassDeclaration(statement) && statement.name?.text === exportName) {
      roots.push(statement);
    } else if (ts.isExportAssignment(statement) && exportName === "default") {
      roots.push(statement);
    }
  }
  // Unresolvable (a re-export, a barrel): fall back to the whole module. Over-reports, never under.
  return roots.length > 0 ? roots : [sf];
}

type ReadSite = { file: string; line: number };

/** Every DB read written in `roots` that no establisher lexically covers, plus the edges to follow. */
function scan(
  file: string,
  roots: ts.Node[],
  sf = parse(file),
): { reads: ReadSite[]; edges: Set<string> } {
  const ranges = coveredRangesOf(file);
  const isCovered = (position: number) =>
    ranges.some(([from, to]) => position >= from && position < to);
  const imports = importsOf(file);
  const locals = localDeclarationsOf(file);

  const containerVariables = new Set<string>([DI_CONTAINER_VARIABLE]);
  const collectContainers = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      calleeName(node.initializer) === DI_CONTAINER
    ) {
      containerVariables.add(node.name.text);
    }
    ts.forEachChild(node, collectContainers);
  };
  collectContainers(sf);
  const rootObjectName = (expression: ts.Expression): string | null => {
    let current: ts.Node = expression;
    while (
      ts.isPropertyAccessExpression(current) ||
      ts.isElementAccessExpression(current) ||
      ts.isCallExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isParenthesizedExpression(current)
    ) {
      current = current.expression;
    }
    return ts.isIdentifier(current) ? current.text : null;
  };

  const reads: ReadSite[] = [];
  const edges = new Set<string>();
  const queue = [...roots];
  const queued = new Set<ts.Node>(roots);

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    const start = node.getStart(sf);
    if (isCovered(start)) return;
    if (ts.isCallExpression(node)) {
      const name = calleeName(node);
      const isEstablisher =
        name !== null &&
        (ESTABLISHERS.has(name) || (CONDITIONAL_ESTABLISHERS as readonly string[]).includes(name));
      const viaContainer =
        ts.isPropertyAccessExpression(node.expression) &&
        containerVariables.has(rootObjectName(node.expression) ?? "");
      // An establisher's own read is the bootstrap read it exists to perform — out of this class.
      if (!isEstablisher && ((name !== null && SQL_EXECUTORS.has(name)) || viaContainer)) {
        reads.push({ file, line: sf.getLineAndCharacterOfPosition(start).line + 1 });
      }
    }
    if (ts.isIdentifier(node) && !NON_EDGE_NAMES.has(node.text)) {
      const imported = imports.get(node.text);
      if (imported) {
        const sameFileRouteEntry = imported.file === file;
        if (!isClientComponent(imported.file) && (sameFileRouteEntry || !isRouteEntry(imported.file))) {
          edges.add(`${imported.file} ${imported.name}`);
        }
      } else {
        const local = locals.get(node.text);
        if (local && !queued.has(local)) {
          queued.add(local);
          queue.push(local);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  while (queue.length > 0) visit(queue.shift()!);
  return { reads, edges };
}

const firstUncoveredCache = new Map<string, ReadSite | null>();
const inProgress = new Set<string>();

/** The first DB read reachable from `file#exportName` with no principal established on the way. */
function firstUncoveredRead(file: string, exportName: string | null): ReadSite | null {
  const key = `${file} ${exportName ?? ""}`;
  const cached = firstUncoveredCache.get(key);
  if (cached !== undefined) return cached;
  if (inProgress.has(key)) return null; // cycle: the other frame answers for it
  inProgress.add(key);

  const { reads, edges } = scan(file, rootsFor(file, exportName));
  reads.sort((a, b) => a.line - b.line);
  let answer: ReadSite | null = reads[0] ?? null;
  if (answer === null) {
    for (const edge of [...edges].sort()) {
      const [target, name] = edge.split(" ") as [string, string];
      const found = firstUncoveredRead(target, name);
      if (found !== null) {
        answer = found;
        break;
      }
    }
  }
  inProgress.delete(key);
  firstUncoveredCache.set(key, answer);
  return answer;
}

const pageEntries = walk(APP)
  .filter((file) => /(^|\/)(page|layout|default|template|not-found)\.tsx$/.test(file))
  .sort();

const rel = (file: string) => path.relative(APP, file);
const relSrc = (file: string) => path.relative(SRC, file);

/** Reads written in the page entry file ITSELF that nothing in that file covers. */
function ownFileUncoveredReads(entry: string): ReadSite[] {
  return scan(entry, [parse(entry)]).reads;
}

/**
 * PAGES THAT CAN REACH A DB READ WITH NO PRINCIPAL ESTABLISHED ON THE PATH — the exact, frozen
 * surface. Every member is a public / pre-authentication surface, or a page whose safety rests on
 * control flow this analysis cannot read (see limit 2 in the header). Nothing here 500s today: the
 * booking pages' reads land in a bootstrap-declared branch the function-granular walk cannot
 * isolate, and the landing's read goes through `app.read_public_runtime_setting`.
 *
 * Adding a member must be a deliberate, reviewed act — that is the whole point of freezing it.
 * Removing the class properly (a public read surface: separate projection + dedicated read-only
 * role) is night plan item **A-2**, an owner-gated decision, not this one.
 */
// PBK-1 (2026-07-27): path-only update. Commit de0b061e0 dropped the literal `new` segment from
// both booking route trees (`app/app/patient/booking/new/**` -> `app/app/patient/booking/**`,
// `app/book/new/**` -> `app/book/**`) at the owner's request; the page content, its principal and
// the count of members here (12) are unchanged — only where each page is reached under moved.
const UNPRINCIPLED_REACHABLE_PAGES: readonly string[] = [
  // Anonymous specialist-first landing. Reads `app_base_url` through the PUBLIC projection
  // accessor; charged here only because `getEffective` also holds the organization branch.
  "page.tsx -> infra/repos/pgAppRuntimeSettings.ts",
  // Anonymous clinic booking funnel: `app_display_timezone` through the same public accessor.
  "book/confirm/page.tsx -> infra/repos/pgAppRuntimeSettings.ts",
  "book/slot/page.tsx -> infra/repos/pgAppRuntimeSettings.ts",
  "app/patient/booking/done/page.tsx -> infra/repos/pgAppRuntimeSettings.ts",
  // Public `/book/{slug}` catalog: reads run under `withExplicitOrganizationPrincipal`, the
  // organization id resolution under `stampBootstrapPrincipal`; the shared catalog helper takes
  // the container as a PARAMETER, which the walk charges to the caller.
  "book/service/page.tsx -> app/app/patient/booking/bookingCatalogRsc.ts",
  "app/patient/booking/service/page.tsx -> app/app/patient/booking/bookingCatalogRsc.ts",
  "app/patient/booking/slot/page.tsx -> app/app/patient/booking/bookingCatalogRsc.ts",
  // `getOptionalPatientSession()` + early return: safe by control flow, not by lexical coverage.
  "app/patient/booking/confirm/page.tsx -> app/app/patient/booking/confirm/page.tsx",
  "app/patient/booking/page.tsx -> app/app/patient/booking/page.tsx",
  "app/patient/content/[slug]/page.tsx -> app/app/patient/content/[slug]/page.tsx",
  "app/patient/help/[slug]/page.tsx -> app/app/patient/help/[slug]/page.tsx",
  "app/patient/sections/[slug]/page.tsx -> app/app/patient/sections/[slug]/page.tsx",
];

describe("RSC page DB-principal census (night plan A-5, bug class of 19f52fed2)", () => {
  const analyze = (source: string) => {
    const file = path.join(APP, "__census_selftest__.tsx");
    const sf = parse(file, source);
    coveredCache.set(file, coveredRanges(sf));
    importMapCache.set(file, new Map());
    localDeclCache.set(file, new Map());
    const result = scan(file, [sf], sf);
    coveredCache.delete(file);
    importMapCache.delete(file);
    localDeclCache.delete(file);
    return result.reads.length;
  };

  it("counts coverage at the CALL SITE, so neither an import nor a missing await satisfies it", () => {
    // Shape 1 of 19f52fed2 (staff page): guard, then reads.
    expect(
      analyze(`export default async function P() {
        const workspace = await requireDoctorWorkspaceContext();
        const deps = buildAppDeps();
        return deps.references.listCategories();
      }`),
    ).toBe(0);
    // Shape 2 (global-admin page): await requireAdminDoctorPage().
    expect(
      analyze(`export default async function P() {
        await requireAdminDoctorPage();
        const deps = buildAppDeps();
        return deps.systemSettings.getSetting("k", "admin");
      }`),
    ).toBe(1 - 1);
    // Wrapper shape: the read lives inside the wrapper's callback.
    expect(
      analyze(`export default async function P(ctx: unknown) {
        const deps = buildAppDeps();
        return withDoctorWorkspacePrincipal(ctx, () => deps.references.listCategories());
      }`),
    ).toBe(0);
    // DEFEAT (a) — the guard is called but never awaited.
    expect(
      analyze(`export default async function P() {
        requireAdminDoctorPage();
        const deps = buildAppDeps();
        return deps.systemSettings.getSetting("k", "admin");
      }`),
    ).toBe(1);
    // DEFEAT (a) — the guard is only imported, or only named in a comment.
    expect(
      analyze(`import { requireAdminDoctorPage } from "@/app/app/settings/requireAdminDoctorPage";
      export default async function P() {
        // calls requireAdminDoctorPage() upstream, in the layout
        const deps = buildAppDeps();
        return deps.systemSettings.getSetting("k", "admin");
      }`),
    ).toBe(1);
    // Building the container is not a read; a bare SQL executor is.
    expect(analyze(`export const x = () => { buildAppDeps(); };`)).toBe(0);
    expect(analyze(`export const x = () => runWebappPgText("SELECT 1", []);`)).toBe(1);
    // The declared pre-auth escape hatch covers, exactly as it does for the 43 route handlers.
    expect(
      analyze(`export const x = () => {
        stampBootstrapPrincipal("s");
        return runWebappPgText("SELECT 1", []);
      };`),
    ).toBe(0);
    // `getOptionalPatientSession` stamps nothing for an anonymous caller, so it covers nothing.
    expect(
      analyze(`export default async function P() {
        const session = await getOptionalPatientSession();
        const deps = buildAppDeps();
        return deps.x.y(session);
      }`),
    ).toBe(1);
  });

  it("makes every DB read written in a page entry itself state its own principal", () => {
    const offenders = pageEntries
      .filter((entry) => ownFileUncoveredReads(entry).length > 0)
      .map((entry) => `${rel(entry)}:${ownFileUncoveredReads(entry)[0]!.line}`);
    // A page here reads with whatever principal happens to be ambient — for a page whose only
    // guard is its layout's, that is BOOTSTRAP: the bare `bcb_*_nonstaff_login`. Fix it in the
    // PAGE with one of the two shapes of 19f52fed2, or declare `stampBootstrapPrincipal()` if the
    // read is deliberately pre-authentication. Never by granting the nonstaff login role the table.
    expect(offenders).toEqual([
      // `getOptionalPatientSession()` + early return — safe by control flow, see the header.
      // PBK-1 (2026-07-27): path only — `new/confirm` -> `confirm`, `new/page.tsx` -> `page.tsx`.
      "app/patient/booking/confirm/page.tsx:138",
      "app/patient/booking/page.tsx:55",
      "app/patient/content/[slug]/page.tsx:33",
      "app/patient/help/[slug]/page.tsx:28",
      "app/patient/sections/[slug]/page.tsx:42",
    ]);
  });

  it("freezes the census so a new DB-reading page is reviewed, not silently added", () => {
    const readers = pageEntries.filter(
      (entry) => scan(entry, [parse(entry)]).reads.length > 0 || firstUncoveredRead(entry, null) !== null,
    );
    // PLAT-01…09 slice 1 (2026-07-26): net +1 page entry. `system-health/page.tsx` moved from
    // `(global-admin)/doctor/` to `app/platform/` (net 0: one entry removed, one added), plus the
    // new `app/platform/layout.tsx` sibling of the pre-existing `(global-admin)/doctor/layout.tsx`
    // (net +1 — both call `requirePlatformOperationsPage()`, neither is itself a DB read).
    // PLAT-01…09 slice 2 (2026-07-26): net 0. `health-archive/page.tsx` and `audit-log/page.tsx`
    // moved the same way (one entry removed, one added, each) — no new layout.tsx this time, since
    // `app/platform/layout.tsx` already exists from slice 1.
    // PLAT-01…09 slice 3 (2026-07-26): net 0. `commercial/page.tsx` moved the same way (one entry
    // removed, one added) — no new layout.tsx, same reason.
    // Owner ruling 2026-07-26 (final home): the whole `app/platform/*` tree (13 page.tsx entries)
    // renamed to `app/admin/*`, merging with the pre-existing `app/admin/layout.tsx` +
    // `admin/promo/page.tsx`. Net -1 page entry: the 13 page.tsx files move 1:1 (net 0), but
    // `app/platform/layout.tsx` is deleted outright — its guard/shell content now lives in the
    // pre-existing `app/admin/layout.tsx` instead of a second, sibling layout.tsx. Readers stay at
    // 12: `app/admin/layout.tsx` (before and after this rename) reaches no DB read in its own file
    // — its guard call covers the rest of the block, and the shell it renders is a client
    // component, so no edge is followed into it.
    // PBK-1 (2026-07-27): net -9 page entries. Both booking trees dropped the literal `new`
    // segment (`app/app/patient/booking/new/**` -> `app/app/patient/booking/**`, `app/book/new/**`
    // -> `app/book/**`); the pre-existing parent-level pages that used to be thin re-export shims
    // for the `new/*` step content are now that content itself, one file per step, so the 9 former
    // `new/*/page.tsx` entries (5 under patient booking, 4 under public booking) are gone and no
    // new entries appear in their place. Readers stay at 12: the moved step pages already counted
    // as readers by their old (shim) path, so the DB-reading page COUNT is unchanged — only the
    // path each one is reached under moved (see the surface assertion below).
    // Platform clinic console: 163 -> 165 page entries for `app/admin/clinics/page.tsx` and
    // `app/admin/clinics/[organizationId]/page.tsx`. Both await `requirePlatformOperationsPage()`
    // and render the client console; they do not build deps or read the DB in their RSC context.
    // Data comes later through guarded GET `/api/admin/organizations`, so readers remain exactly 12.
    // The unsafe platform support page was removed again after audit proved its backing store mixes
    // patient-to-doctor and rehabilitation text. Page entries return 166 -> 165; readers stay 12.
    expect(pageEntries).toHaveLength(165);
    expect(readers).toHaveLength(12);
  });

  it("keeps the unprincipled-reachable page surface exact", () => {
    const surface = pageEntries
      .map((entry) => ({ entry, hit: firstUncoveredRead(entry, null) }))
      .filter((row): row is { entry: string; hit: ReadSite } => row.hit !== null)
      .map((row) => `${rel(row.entry)} -> ${relSrc(row.hit.file)}`)
      .sort();
    expect(surface).toEqual([...UNPRINCIPLED_REACHABLE_PAGES].sort());
  });
});
