/**
 * taskdb #821 — Phase 1 regression coverage for the plain-read chokepoint in `drizzle.ts`
 * (`withIssueTimePrincipalReads`). Unlike `drizzle.test.ts` (which mocks `drizzle-orm/node-postgres`
 * entirely to unit-test the `.transaction()` wrapper), these tests use the REAL `drizzle-orm` package
 * against a fake `pg.Pool`-shaped object, because the bug this fixes lives specifically in
 * drizzle-orm's lazy `QueryPromise`/`PgRaw` thenables (see node_modules/drizzle-orm/query-promise.js)
 * deferring real work to `.then()` — a mock of `drizzle()` itself would not exercise that laziness.
 *
 * See docs/_TODO/SAAS_FOUNDATION/RLS_UNPRINCIPLED_READ_FIX_PLAN.md §§1, 4, 6 for the design and the
 * isolation-safety argument this proves empirically.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enterWithDbStaffPrincipal,
  getCurrentDbPrincipal,
  runWithDbOrganizationPrincipal,
  runWithDbPatientPrincipal,
} from "@bersoncare/db-principal";
import { eq, sql } from "drizzle-orm";
import { platformUsers } from "../../../db/schema";

vi.mock("@/infra/db/saasIsolationDbFailureReporting", () => ({
  reportDbCleanupFailure: vi.fn(async () => undefined),
  reportDbQueryFailure: vi.fn(async () => undefined),
  reportPrincipalSetupFailure: vi.fn(async () => undefined),
}));

type RecordedCall = {
  sqlText: string;
  principalAtCallTime: unknown;
};

const harness = vi.hoisted(() => ({
  pool: undefined as
    | {
        query: (...args: unknown[]) => Promise<unknown>;
        connect: () => Promise<unknown>;
        on: (...args: unknown[]) => unknown;
      }
    | undefined,
  calls: [] as RecordedCall[],
  shouldFail: false,
}));

vi.mock("./client", () => ({
  getPool: vi.fn(() => {
    if (!harness.pool) throw new Error("Drizzle read-chokepoint test pool is not configured");
    return harness.pool;
  }),
}));

// Statically imported (matching drizzle.test.ts's own convention) — NOT re-imported per test via
// `vi.resetModules()`. `getDrizzle()`'s module-level `db` singleton is intentionally shared across
// these tests (mirroring the real singleton in production); the fake pool it captures on the first
// call keeps routing every later query into the SAME shared `harness.calls`/`harness.shouldFail`,
// which `beforeEach` resets. Re-importing `./drizzle` per test via `resetModules()` would instead
// hand it a SEPARATE copy of `@bersoncare/db-principal` (a different `AsyncLocalStorage` instance)
// than the one this test file imports directly above — silently breaking every assertion here.
import { getDrizzle } from "./drizzle";

const ORG_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const ORG_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const DOCTOR_A = "cccccccc-0000-4000-8000-0000000000c1";
const DOCTOR_B = "dddddddd-0000-4000-8000-0000000000d2";

function createFakePool(): NonNullable<typeof harness.pool> {
  const pool: NonNullable<typeof harness.pool> = {
    query: async (queryConfigOrText: unknown) => {
      const sqlText =
        typeof queryConfigOrText === "string"
          ? queryConfigOrText
          : ((queryConfigOrText as { text?: string })?.text ?? String(queryConfigOrText));
      harness.calls.push({ sqlText, principalAtCallTime: getCurrentDbPrincipal() });
      if (harness.shouldFail && /platform_users/.test(sqlText)) {
        throw new Error("simulated_query_failure");
      }
      // Array-mode row (drizzle uses rowMode: "array" whenever an explicit field list is given, e.g.
      // partial `.select({ id: ... })` or a relational `columns: { id: true }` query) — one value per
      // selected column, in selection order. Every query in this file selects exactly `id`.
      return { rows: [[DOCTOR_A]], rowCount: 1 };
    },
    connect: async () => {
      throw new Error("connect() should not be used for plain reads in this test");
    },
    on: () => pool,
  };
  return pool;
}

describe("getDrizzle plain-read issue-time principal chokepoint (taskdb #821)", () => {
  beforeEach(() => {
    harness.calls = [];
    harness.shouldFail = false;
    harness.pool = createFakePool();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("threads the run()-scoped principal to the underlying pool.query() for a plain .select()", async () => {
    const db = getDrizzle();

    await runWithDbOrganizationPrincipal(ORG_A, () =>
      db.select({ id: platformUsers.id }).from(platformUsers).where(eq(platformUsers.id, DOCTOR_A)),
    );

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.principalAtCallTime).toMatchObject({ kind: "organization", organizationId: ORG_A });
  });

  it("THE RUN-SCOPED-RETURN-LAZY CASE: a query issued under one org, returned un-awaited from the " +
    "run()-scoped callback, and awaited only after a DIFFERENT principal became ambient, still " +
    "executes under the ORIGINAL (issue-time) principal — mirrors payment-timeline/route.ts's " +
    "`withDoctorWorkspacePrincipal(gate.ctx, () => deps.patientPayments.listPayments(...))` inside " +
    "`Promise.all([...])`", async () => {
    const db = getDrizzle();

    let issued: Promise<unknown> | undefined;
    runWithDbOrganizationPrincipal(ORG_A, () => {
      // Issue the query synchronously under ORG_A, but do NOT await it here — return it un-awaited,
      // exactly like `() => deps.patientPayments.listPayments(...)` returning its (un-awaited-by-the-
      // callback) promise into an outer `Promise.all`.
      issued = db.select({ id: platformUsers.id }).from(platformUsers).where(eq(platformUsers.id, DOCTOR_A));
      return undefined;
    });

    // Something else re-points the ambient DB principal before the deferred query's `.then()` fires —
    // a sibling `Promise.all` entry, a later `enterWithDbStaffPrincipal` call in the same request, or
    // (worst case) a concurrent request sharing the same process. Simulate the worst case directly.
    enterWithDbStaffPrincipal({ organizationId: ORG_B, platformUserId: DOCTOR_B });

    await issued;

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.principalAtCallTime).toMatchObject({ kind: "organization", organizationId: ORG_A });
  });

  it("fails closed: a query issued with NO principal stays unprincipled at execute time even if a " +
    "principal becomes ambient later — never accidentally adopts a foreign org", async () => {
    const db = getDrizzle();

    // No principal established at all right now (fresh ALS context).
    const issued = db.select({ id: platformUsers.id }).from(platformUsers).where(eq(platformUsers.id, DOCTOR_A));

    await runWithDbOrganizationPrincipal(ORG_B, async () => {
      await issued;
    });

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.principalAtCallTime).toBeUndefined();
  });

  it("concurrent async contexts never bleed principals across interleaved plain reads", async () => {
    const db = getDrizzle();

    const jobs = [ORG_A, ORG_B].map((organizationId) =>
      runWithDbOrganizationPrincipal(organizationId, () =>
        db.select({ id: platformUsers.id }).from(platformUsers).where(eq(platformUsers.id, DOCTOR_A)),
      ),
    );
    await Promise.all(jobs);

    expect(harness.calls).toHaveLength(2);
    const seenOrgs = harness.calls
      .map((c) => (c.principalAtCallTime as { organizationId?: string } | undefined)?.organizationId)
      .sort();
    expect(seenOrgs).toEqual([ORG_A, ORG_B].sort());
  });

  it("db.execute(sql) (single-hop PgRaw) is also issue-time principled", async () => {
    const db = getDrizzle();

    let issued: Promise<unknown> | undefined;
    runWithDbOrganizationPrincipal(ORG_A, () => {
      issued = db.execute(sql`select 1`);
      return undefined;
    });
    enterWithDbStaffPrincipal({ organizationId: ORG_B, platformUserId: DOCTOR_B });
    await issued;

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.principalAtCallTime).toMatchObject({ kind: "organization", organizationId: ORG_A });
  });

  it("db.query.<table>.findFirst (single-hop relational query) is also issue-time principled", async () => {
    const db = getDrizzle();

    let issued: Promise<unknown> | undefined;
    runWithDbOrganizationPrincipal(ORG_A, () => {
      issued = db.query.platformUsers.findFirst({
        where: eq(platformUsers.id, DOCTOR_A),
        columns: { id: true },
      });
      return undefined;
    });
    enterWithDbStaffPrincipal({ organizationId: ORG_B, platformUserId: DOCTOR_B });
    await issued;

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.principalAtCallTime).toMatchObject({ kind: "organization", organizationId: ORG_A });
  });

  it("the persistent enterWith pattern (pattern 1) still works unwrapped, exactly as before", async () => {
    const db = getDrizzle();

    await runWithDbOrganizationPrincipal(ORG_A, async () => {
      // No explicit wrap around this read at all -- relies on the ambient, request-persistent
      // principal (the common, already-safe pattern) -- must keep working unchanged.
      await db.select({ id: platformUsers.id }).from(platformUsers).where(eq(platformUsers.id, DOCTOR_A));
    });

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.principalAtCallTime).toMatchObject({ kind: "organization", organizationId: ORG_A });
  });

  it("cleanup on error: a failing query does not leak its issue-time snapshot into the surrounding " +
    "ambient context, and the snapshot re-entry does not swallow or alter the original error", async () => {
    const db = getDrizzle();
    harness.shouldFail = true;

    let observedAmbientAfterFailure: unknown;
    await runWithDbOrganizationPrincipal(ORG_B, async () => {
      let caught: unknown;
      try {
        await runWithDbOrganizationPrincipal(ORG_A, () =>
          db.select({ id: platformUsers.id }).from(platformUsers).where(eq(platformUsers.id, DOCTOR_A)),
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      // drizzle-orm wraps the driver error in a DrizzleQueryError; the ORIGINAL error survives as `.cause`.
      expect((caught as Error & { cause?: unknown }).cause).toMatchObject({ message: "simulated_query_failure" });
      observedAmbientAfterFailure = getCurrentDbPrincipal();
    });

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.principalAtCallTime).toMatchObject({ kind: "organization", organizationId: ORG_A });
    // Ambient context after the failure must have correctly reverted to the OUTER (ORG_B) principal,
    // not stayed pinned to the failed query's ORG_A snapshot.
    expect(observedAmbientAfterFailure).toMatchObject({ kind: "organization", organizationId: ORG_B });
  });

  it("a patient principal snapshot (not just staff/organization) also threads correctly", async () => {
    const db = getDrizzle();
    const patientUserId = "eeeeeeee-0000-4000-8000-0000000000e3";

    let issued: Promise<unknown> | undefined;
    runWithDbPatientPrincipal({ organizationId: ORG_A, platformUserId: patientUserId }, () => {
      issued = db.select({ id: platformUsers.id }).from(platformUsers).where(eq(platformUsers.id, patientUserId));
      return undefined;
    });
    enterWithDbStaffPrincipal({ organizationId: ORG_B, platformUserId: DOCTOR_B });
    await issued;

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.principalAtCallTime).toMatchObject({ kind: "patient", platformUserId: patientUserId });
  });
});
