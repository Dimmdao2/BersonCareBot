import { describe, expect, it, vi } from "vitest";
import { runWithDbOrganizationPrincipal } from "@bersoncare/db-principal";
import type { DbPort } from "../../kernel/contracts/index.js";
import { drizzleSqlFragmentToApproximateSql } from "./drizzleSqlDebugText.js";
import { createDbWritePort } from "./writePort.js";
import { stubIntegratorDrizzleForTests } from "./stubIntegratorDrizzleForTests.js";

function attachExecuteToQuery(
  query: DbPort["query"],
  drizzle: ReturnType<typeof stubIntegratorDrizzleForTests>,
): void {
  const d = drizzle as { execute: ReturnType<typeof vi.fn> };
  d.execute = vi.fn(async (frag: unknown) => {
    const flat = drizzleSqlFragmentToApproximateSql(frag);
    return query(flat, []);
  });
}

function makeMockDb(capture: {
  projectionInserts: { eventType: string; idempotencyKey: string; payload: Record<string, unknown> }[];
}) {
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes("user_channel_bindings")) {
      return {
        rows: [
          {
            platform_user_id: "00000000-0000-4000-8000-000000000001",
            existing_int_uid: null,
          },
        ],
      } as Awaited<ReturnType<DbPort["query"]>>;
    }
    if (
      sql.includes("public.platform_users") &&
      sql.includes("phone_normalized = $1") &&
      sql.includes("id <> $2::uuid")
    ) {
      return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
    }
    if (
      sql.includes("public.platform_users") &&
      sql.includes("integrator_user_id = $1::bigint") &&
      sql.includes("id <> $2::uuid")
    ) {
      return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
    }
    if (sql.includes("UPDATE public.platform_users")) {
      return { rows: [], rowCount: 1 } as Awaited<ReturnType<DbPort["query"]>>;
    }
    if (sql.includes("merged_into_user_id") && sql.includes("FROM users")) {
      return { rows: [{ merged_into_user_id: null }] } as Awaited<ReturnType<DbPort["query"]>>;
    }

    // telegram upsertUser() final SELECT
    if (sql.includes("SELECT ri.user_id::text AS id")) {
      return { rows: [{ id: "uid-tg", channel_id: "123" }] } as Awaited<ReturnType<DbPort["query"]>>;
    }

    // max identity lookup after ensureIdentityForMessenger()
    if (sql.includes("SELECT user_id::text AS user_id FROM identities") && !sql.includes("FROM identities i")) {
      return { rows: [{ user_id: "uid-max" }] } as Awaited<ReturnType<DbPort["query"]>>;
    }

    // setUserPhone: identities by resource + external_id
    if (sql.includes("FROM identities i") && sql.includes("i.resource") && sql.includes("external_id")) {
      return { rows: [{ user_id: "uid-tg" }], rowCount: 1 } as Awaited<ReturnType<DbPort["query"]>>;
    }

    if (sql.includes("INSERT INTO contacts") && sql.includes("ON CONFLICT")) {
      return { rows: [], rowCount: 1 } as Awaited<ReturnType<DbPort["query"]>>;
    }

    return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
  }) as DbPort["query"];
  const drizzle = stubIntegratorDrizzleForTests(capture);
  attachExecuteToQuery(query, drizzle);
  const tx = vi.fn(async (fn: (txDb: DbPort) => Promise<void>) => fn({ query, tx, integratorDrizzle: drizzle } as DbPort));
  return { query, tx, integratorDrizzle: drizzle } as DbPort;
}

/**
 * D1: `user.upsert` / `notifications.update` no longer fan out `user.upserted` / `preferences.updated`
 * projection-outbox rows — they write `public.platform_users` / `user_channel_bindings` /
 * `user_notification_topics` directly on the tx-bound `DbPort` (see `writeIdentityAndPreferencesDirect.ts`).
 * This mock is a minimal tag router purpose-built for that path (channel anchor → advisory lock →
 * candidate resolution → insert/update → binding/topics), distinct from `makeMockDb` above which is
 * tailored to the (unchanged) `user.phone.link` flow.
 */
function makeDirectWriteMockDb(overrides?: {
  candidateRows?: Record<string, unknown>[];
  onQuery?: (sql: string, params: unknown[]) => Awaited<ReturnType<DbPort["query"]>> | undefined;
}) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    const overridden = overrides?.onQuery?.(sql, params);
    if (overridden) return overridden;

    // telegram upsertUser() final SELECT
    if (sql.includes("SELECT ri.user_id::text AS id")) {
      return { rows: [{ id: "uid-tg", channel_id: "123" }] } as Awaited<ReturnType<DbPort["query"]>>;
    }
    // max: identity lookup after ensureIdentityForMessenger()
    if (sql.includes("SELECT user_id::text AS user_id FROM identities") && !sql.includes("FROM identities i")) {
      return { rows: [{ user_id: "uid-max" }] } as Awaited<ReturnType<DbPort["query"]>>;
    }
    // resolveCanonicalIntegratorUserId
    if (sql.includes("merged_into_user_id") && sql.includes("FROM users")) {
      return { rows: [{ merged_into_user_id: null }] } as Awaited<ReturnType<DbPort["query"]>>;
    }
    // A3 advisory lock
    if (sql.includes("pg_advisory_xact_lock")) {
      return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
    }
    // collectPlatformUserCandidates: by integrator_user_id / by channel binding
    if (sql.includes("FROM public.platform_users") && sql.includes("integrator_user_id = $1::bigint") && sql.includes("LIMIT 3")) {
      return { rows: overrides?.candidateRows ?? [] } as Awaited<ReturnType<DbPort["query"]>>;
    }
    if (sql.includes("FROM public.user_channel_bindings ucb")) {
      return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
    }
    if (sql.includes("INSERT INTO public.platform_users")) {
      return { rows: [{ id: "pu-new" }] } as Awaited<ReturnType<DbPort["query"]>>;
    }
    if (sql.includes("UPDATE public.platform_users")) {
      return { rows: [], rowCount: 1 } as Awaited<ReturnType<DbPort["query"]>>;
    }
    if (sql.includes("INSERT INTO public.user_channel_bindings")) {
      return { rows: [{ user_id: "pu-new" }], rowCount: 1 } as Awaited<ReturnType<DbPort["query"]>>;
    }
    if (sql.includes("INSERT INTO public.user_notification_topics")) {
      return { rows: [], rowCount: 1 } as Awaited<ReturnType<DbPort["query"]>>;
    }
    return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
  }) as DbPort["query"];
  const drizzle = stubIntegratorDrizzleForTests();
  attachExecuteToQuery(query, drizzle);
  const tx = vi.fn(async <T>(fn: (txDb: DbPort) => Promise<T>) => {
    const txDb = { query, tx: vi.fn(async <N>(nested: (inner: DbPort) => Promise<N>) => nested(txDb)), integratorDrizzle: drizzle } as DbPort;
    return fn(txDb);
  });
  const db = { query, tx, integratorDrizzle: drizzle } as DbPort;
  return { db, query, queries };
}

function makeWriteWrapperDb(): { db: DbPort; query: ReturnType<typeof vi.fn>; tx: ReturnType<typeof vi.fn> } {
  const query = vi.fn(async () => ({ rows: [], rowCount: 1 })) as DbPort["query"] & ReturnType<typeof vi.fn>;
  const tx = vi.fn(async <T>(fn: (txDb: DbPort) => Promise<T>) => {
    const integratorDrizzle = stubIntegratorDrizzleForTests();
    (integratorDrizzle as { execute: ReturnType<typeof vi.fn> }).execute = vi.fn(async () => ({
      rows: [],
      rowCount: 1,
    }));
    const txDb = {
      query,
      tx: vi.fn(async <Nested>(nested: (inner: DbPort) => Promise<Nested>) => nested(txDb)),
      integratorDrizzle,
    } as DbPort;
    return fn(txDb);
  }) as DbPort["tx"] & ReturnType<typeof vi.fn>;
  return { db: { query, tx }, query, tx };
}

describe("writePort user.upsert projection payload", () => {
  it("wraps a plain mutation in db.tx when an organization principal is set", async () => {
    const { db, tx } = makeWriteWrapperDb();
    const writePort = createDbWritePort({ db });

    await runWithDbOrganizationPrincipal("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", () =>
      writePort.writeDb({
        type: "user.state.set",
        params: { resource: "telegram", channelUserId: "123", state: "awaiting_phone" },
      }),
    );

    expect(tx).toHaveBeenCalledTimes(1);
  });

  it("wraps retry enqueue in db.tx when an organization principal is set", async () => {
    const { db, tx } = makeWriteWrapperDb();
    const writePort = createDbWritePort({ db });

    await runWithDbOrganizationPrincipal("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", () =>
      writePort.writeDb({
        type: "message.retry.enqueue",
        params: {
          phoneNormalized: "+79990001122",
          messageText: "test",
        },
      }),
    );

    expect(tx).toHaveBeenCalledTimes(1);
  });

  it("does not wrap a plain mutation when organization principal is unset", async () => {
    const { db, tx } = makeWriteWrapperDb();
    const writePort = createDbWritePort({ db });

    await writePort.writeDb({
      type: "user.state.set",
      params: { resource: "telegram", channelUserId: "123", state: "awaiting_phone" },
    });

    expect(tx).not.toHaveBeenCalled();
  });

  it("does not wrap when the DbPort is already transaction-bound", async () => {
    const integratorDrizzle = stubIntegratorDrizzleForTests();
    (integratorDrizzle as { execute: ReturnType<typeof vi.fn> }).execute = vi.fn(async () => ({
      rows: [],
      rowCount: 1,
    }));
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 })) as DbPort["query"] & ReturnType<typeof vi.fn>;
    const tx = vi.fn(async <T>(fn: (txDb: DbPort) => Promise<T>) => fn({ query, tx, integratorDrizzle } as DbPort));
    const db = { query, tx, integratorDrizzle } as DbPort;
    const writePort = createDbWritePort({ db });

    await runWithDbOrganizationPrincipal("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", () =>
      writePort.writeDb({
        type: "user.state.set",
        params: { resource: "telegram", channelUserId: "123", state: "awaiting_phone" },
      }),
    );

    expect(tx).not.toHaveBeenCalled();
  });

  it("D1: user.upsert writes public.platform_users/user_channel_bindings directly for telegram (no projection fanout)", async () => {
    const { db, queries } = makeDirectWriteMockDb();
    const writePort = createDbWritePort({ db });

    await writePort.writeDb({
      type: "user.upsert",
      params: {
        resource: "telegram",
        externalId: "123",
        firstName: "Ivan",
        lastName: "Petrov",
      },
    });

    // No more projection-outbox writes for user.upsert.
    expect(queries.some((q) => q.sql.includes("projection_outbox"))).toBe(false);

    const lock = queries.find((q) => q.sql.includes("pg_advisory_xact_lock"));
    expect(lock).toBeDefined();
    expect(lock?.params[0]).toBe("uid-tg"); // canonical integratorUserId, resolved via resolveCanonicalIntegratorUserId

    const insert = queries.find((q) => q.sql.includes("INSERT INTO public.platform_users"));
    expect(insert).toBeDefined();
    expect(insert?.params).toEqual(["uid-tg", null, "Petrov Ivan", "Ivan", "Petrov"]);

    const binding = queries.find((q) => q.sql.includes("INSERT INTO public.user_channel_bindings"));
    expect(binding).toBeDefined();
    expect(binding?.params).toEqual(["pu-new", "telegram", "123"]);

    // A NEW binding seeds default broadcast preferences (parity with
    // upsertBroadcastDefaultsAfterChannelBind, called by pgUserProjection.ts on the same condition).
    const seed = queries.find((q) => q.sql.includes("INSERT INTO public.user_channel_preferences"));
    expect(seed).toBeDefined();
    expect(seed?.params).toEqual(["pu-new", "telegram", expect.any(Date)]);
  });

  it("D1: user.upsert writes public.platform_users/user_channel_bindings directly for max (no projection fanout)", async () => {
    const { db, queries } = makeDirectWriteMockDb();
    const writePort = createDbWritePort({ db });

    await writePort.writeDb({
      type: "user.upsert",
      params: {
        resource: "max",
        externalId: "555123",
        firstName: "Max",
        lastName: "Admin",
      },
    });

    expect(queries.some((q) => q.sql.includes("projection_outbox"))).toBe(false);

    const lock = queries.find((q) => q.sql.includes("pg_advisory_xact_lock"));
    expect(lock?.params[0]).toBe("uid-max");

    const insert = queries.find((q) => q.sql.includes("INSERT INTO public.platform_users"));
    expect(insert?.params).toEqual(["uid-max", null, "Admin Max", "Max", "Admin"]);

    const binding = queries.find((q) => q.sql.includes("INSERT INTO public.user_channel_bindings"));
    expect(binding?.params).toEqual(["pu-new", "max", "555123"]);

    const seed = queries.find((q) => q.sql.includes("INSERT INTO public.user_channel_preferences"));
    expect(seed?.params).toEqual(["pu-new", "max", expect.any(Date)]);
  });

  it("D1: user.upsert silently no-ops for a non-numeric telegram externalId (channel anchor unresolved)", async () => {
    const { db, queries } = makeDirectWriteMockDb();
    const writePort = createDbWritePort({ db });

    await writePort.writeDb({
      type: "user.upsert",
      params: { resource: "telegram", externalId: "not-a-number" },
    });

    // No anchor resolved → the scaffold aborts before any public.* write (matches old silent-return).
    expect(queries.some((q) => q.sql.includes("public.platform_users") || q.sql.includes("public.user_channel_bindings"))).toBe(false);
  });

  it("D1: user.upsert defers (no write, no throw) when candidate resolution is ambiguous", async () => {
    // Two DISTINCT rows both singly matched by integrator_user_id is a data-integrity ambiguity the
    // scaffold rejects before mergeCandidateIds is even called (mirrors webapp's acceptAfterMergeConflict:
    // log + swallow, no write, no retry storm).
    const { db, queries } = makeDirectWriteMockDb({ candidateRows: [{ id: "pu-a" }, { id: "pu-b" }] });
    const writePort = createDbWritePort({ db });

    await expect(
      writePort.writeDb({
        type: "user.upsert",
        params: { resource: "telegram", externalId: "123", firstName: "Ivan" },
      }),
    ).resolves.toBeUndefined();

    expect(queries.some((q) => q.sql.includes("INSERT INTO public.platform_users") || q.sql.includes("UPDATE public.platform_users"))).toBe(false);
  });

  it("user.phone.link updates public + integrator without contact.linked projection fanout", async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: Record<string, unknown> }[] };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });

    const meta = await writePort.writeDb({
      type: "user.phone.link",
      params: {
        resource: "telegram",
        channelUserId: "123",
        phoneNormalized: "+79990001122",
      },
    });

    expect(capture.projectionInserts).toHaveLength(0);
    expect(meta).toMatchObject({ userPhoneLinkApplied: true });
  });

  it("user.phone.link does not mutate either schema when the messenger auth channel is disabled", async () => {
    const query = vi.fn();
    const tx = vi.fn();
    const db = { query, tx } as unknown as DbPort;
    const authChannelPolicy = vi.fn().mockResolvedValue(false);
    const writePort = createDbWritePort({ db, authChannelPolicy });

    const meta = await writePort.writeDb({
      type: "user.phone.link",
      params: {
        resource: "max",
        channelUserId: "555123",
        phoneNormalized: "+79990001122",
      },
    });

    expect(meta).toEqual({
      userPhoneLinkApplied: false,
      phoneLinkReason: "auth_channel_disabled",
    });
    expect(authChannelPolicy).toHaveBeenCalledWith("max");
    expect(tx).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("user.phone.link strict no_channel_binding: no integrator contacts write", async () => {
    let contactsAttempts = 0;
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("user_channel_bindings")) {
        return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
      }
      if (sql.includes("FROM identities i") && sql.includes("i.resource") && sql.includes("LIMIT 1")) {
        return { rows: [{ user_id: "uid-tg" }], rowCount: 1 } as Awaited<ReturnType<DbPort["query"]>>;
      }
      if (sql.includes("INSERT INTO contacts") && sql.includes("ON CONFLICT")) {
        contactsAttempts += 1;
        return { rows: [], rowCount: 1 } as Awaited<ReturnType<DbPort["query"]>>;
      }
      return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
    }) as DbPort["query"];
    const drizzle = stubIntegratorDrizzleForTests();
    attachExecuteToQuery(query, drizzle);
    const tx = vi.fn(async (fn: (txDb: DbPort) => Promise<void>) => fn({ query, tx, integratorDrizzle: drizzle } as DbPort));
    const db = { query, tx, integratorDrizzle: drizzle } as DbPort;
    const writePort = createDbWritePort({ db });

    const meta = await writePort.writeDb({
      type: "user.phone.link",
      params: {
        resource: "telegram",
        channelUserId: "123",
        phoneNormalized: "+79990001122",
      },
    });

    expect(meta).toMatchObject({
      userPhoneLinkApplied: false,
      phoneLinkReason: "no_channel_binding",
    });
    expect(contactsAttempts).toBe(0);
  });

  it("user.phone.link integrator contacts failure: transient metadata, no projection fanout", async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: Record<string, unknown> }[] };
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("user_channel_bindings")) {
        return {
          rows: [
            {
              platform_user_id: "00000000-0000-4000-8000-000000000001",
              existing_int_uid: null,
            },
          ],
        } as Awaited<ReturnType<DbPort["query"]>>;
      }
      if (
        sql.includes("public.platform_users") &&
        sql.includes("phone_normalized = $1") &&
        sql.includes("id <> $2::uuid")
      ) {
        return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
      }
      if (
        sql.includes("public.platform_users") &&
        sql.includes("integrator_user_id = $1::bigint") &&
        sql.includes("id <> $2::uuid")
      ) {
        return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
      }
      if (sql.includes("UPDATE public.platform_users")) {
        return { rows: [], rowCount: 1 } as Awaited<ReturnType<DbPort["query"]>>;
      }
      if (sql.includes("merged_into_user_id") && sql.includes("FROM users")) {
        return { rows: [{ merged_into_user_id: null }] } as Awaited<ReturnType<DbPort["query"]>>;
      }
      if (sql.includes("FROM identities i") && sql.includes("i.resource")) {
        return { rows: [{ user_id: "uid-tg" }], rowCount: 1 } as Awaited<ReturnType<DbPort["query"]>>;
      }
      if (sql.includes("INSERT INTO contacts") && sql.includes("ON CONFLICT")) {
        throw new Error("simulated contacts write failure");
      }
      return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
    }) as DbPort["query"];
    const drizzle = stubIntegratorDrizzleForTests();
    attachExecuteToQuery(query, drizzle);
    const tx = vi.fn(async (fn: (txDb: DbPort) => Promise<void>) => fn({ query, tx, integratorDrizzle: drizzle } as DbPort));
    const db = { query, tx, integratorDrizzle: drizzle } as DbPort;
    const writePort = createDbWritePort({ db });

    const meta = await writePort.writeDb({
      type: "user.phone.link",
      params: {
        resource: "telegram",
        channelUserId: "123",
        phoneNormalized: "+79990001122",
      },
    });

    expect(meta).toMatchObject({
      userPhoneLinkApplied: false,
      phoneLinkIndeterminate: true,
      phoneLinkReason: "db_transient_failure",
    });
    expect(capture.projectionInserts).toHaveLength(0);
  });

  it("user.phone.link public UPDATE failure before integrator: no contacts write, transient metadata", async () => {
    let contactsAttempts = 0;
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes("user_channel_bindings")) {
        return {
          rows: [
            {
              platform_user_id: "00000000-0000-4000-8000-000000000001",
              existing_int_uid: null,
            },
          ],
        } as Awaited<ReturnType<DbPort["query"]>>;
      }
      if (
        sql.includes("public.platform_users") &&
        sql.includes("phone_normalized = $1") &&
        sql.includes("id <> $2::uuid")
      ) {
        return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
      }
      if (
        sql.includes("public.platform_users") &&
        sql.includes("integrator_user_id = $1::bigint") &&
        sql.includes("id <> $2::uuid")
      ) {
        return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
      }
      if (sql.includes("UPDATE public.platform_users")) {
        const err = new Error("permission denied for table platform_users");
        Object.assign(err, { code: "42501" });
        throw err;
      }
      if (sql.includes("merged_into_user_id") && sql.includes("FROM users")) {
        return { rows: [{ merged_into_user_id: null }] } as Awaited<ReturnType<DbPort["query"]>>;
      }
      if (sql.includes("FROM identities i") && sql.includes("i.resource") && sql.includes("LIMIT 1")) {
        return { rows: [{ user_id: "42" }], rowCount: 1 } as Awaited<ReturnType<DbPort["query"]>>;
      }
      if (sql.includes("INSERT INTO contacts") && sql.includes("ON CONFLICT")) {
        contactsAttempts += 1;
        return { rows: [], rowCount: 1 } as Awaited<ReturnType<DbPort["query"]>>;
      }
      return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
    }) as DbPort["query"];
    const drizzle = stubIntegratorDrizzleForTests();
    attachExecuteToQuery(query, drizzle);
    const tx = vi.fn(async (fn: (txDb: DbPort) => Promise<void>) => fn({ query, tx, integratorDrizzle: drizzle } as DbPort));
    const db = { query, tx, integratorDrizzle: drizzle } as DbPort;
    const writePort = createDbWritePort({ db });

    const meta = await writePort.writeDb({
      type: "user.phone.link",
      params: {
        resource: "telegram",
        channelUserId: "123",
        phoneNormalized: "+79990001122",
      },
    });

    expect(meta).toMatchObject({
      userPhoneLinkApplied: false,
      phoneLinkIndeterminate: true,
      phoneLinkReason: "db_transient_failure",
    });
    expect(contactsAttempts).toBe(0);
  });

  it("D1: notifications.update writes public.user_notification_topics directly (no preferences.updated fanout)", async () => {
    // Distinct id from the anchor-lookup default ("uid-tg"/"uid-max") — this is the SAME query shape
    // (identities by resource+external_id) but a DIFFERENT call site (the removed readPort.readDb link
    // lookup, now a direct query), so give it its own id to keep the assertion unambiguous.
    const { db, queries } = makeDirectWriteMockDb({
      onQuery: (sql) => {
        if (sql.includes("SELECT user_id::text AS user_id FROM identities") && !sql.includes("FROM identities i")) {
          return { rows: [{ user_id: "uid-notify" }] } as Awaited<ReturnType<DbPort["query"]>>;
        }
        return undefined;
      },
    });
    const writePort = createDbWritePort({ db });

    await writePort.writeDb({
      type: "notifications.update",
      params: { resource: "telegram", channelUserId: "123", notify_spb: true, notify_bookings: false },
    });

    expect(queries.some((q) => q.sql.includes("projection_outbox"))).toBe(false);

    const lock = queries.find((q) => q.sql.includes("pg_advisory_xact_lock"));
    expect(lock?.params[0]).toBe("uid-notify");

    const insert = queries.find((q) => q.sql.includes("INSERT INTO public.platform_users"));
    expect(insert).toBeDefined();
    expect(insert?.params).toEqual(["uid-notify", null, "", null, null]);

    // No channel binding written for notifications.update (parity: preferences.updated's
    // upsertFromProjection({ integratorUserId }) call never touches user_channel_bindings either).
    expect(queries.some((q) => q.sql.includes("INSERT INTO public.user_channel_bindings"))).toBe(false);

    const topicInserts = queries.filter((q) => q.sql.includes("INSERT INTO public.user_notification_topics"));
    expect(topicInserts).toHaveLength(2);
    expect(topicInserts.map((q) => q.params)).toEqual(
      expect.arrayContaining([
        ["pu-new", "booking_spb", true],
        ["pu-new", "bookings", false],
      ]),
    );
  });

  it("D1: notifications.update no-ops when no integrator identity is linked yet", async () => {
    const { db, queries } = makeDirectWriteMockDb({
      onQuery: (sql) => {
        if (sql.includes("SELECT user_id::text AS user_id FROM identities") && !sql.includes("FROM identities i")) {
          return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
        }
        return undefined;
      },
    });
    const writePort = createDbWritePort({ db });

    await writePort.writeDb({
      type: "notifications.update",
      params: { resource: "telegram", channelUserId: "999", notify_spb: true },
    });

    expect(queries.some((q) => q.sql.includes("public.platform_users") || q.sql.includes("public.user_notification_topics"))).toBe(false);
  });

  it("D1: notifications.update defers (no write, no throw) when candidate resolution is ambiguous", async () => {
    const { db, queries } = makeDirectWriteMockDb({ candidateRows: [{ id: "pu-a" }, { id: "pu-b" }] });
    const writePort = createDbWritePort({ db });

    await expect(
      writePort.writeDb({
        type: "notifications.update",
        params: { resource: "telegram", channelUserId: "123", notify_spb: true },
      }),
    ).resolves.toBeUndefined();

    expect(queries.some((q) => q.sql.includes("INSERT INTO public.platform_users") || q.sql.includes("INSERT INTO public.user_notification_topics"))).toBe(false);
  });
});
