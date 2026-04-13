import { describe, expect, it, vi } from "vitest";
import type { DbPort } from "../../kernel/contracts/index.js";
import { createDbWritePort } from "./writePort.js";

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
    if (sql.includes("projection_outbox")) {
      const [eventType, idempotencyKey, _occurredAt, payloadJson] = params as [string, string, string, string];
      capture.projectionInserts.push({
        eventType,
        idempotencyKey,
        payload: JSON.parse(payloadJson) as Record<string, unknown>,
      });
      return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
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
    if (sql.includes("FROM identities i") && sql.includes("i.resource = $2")) {
      return { rows: [{ user_id: "uid-tg" }], rowCount: 1 } as Awaited<ReturnType<DbPort["query"]>>;
    }

    if (sql.includes("INSERT INTO contacts") && sql.includes("ON CONFLICT")) {
      return { rows: [], rowCount: 1 } as Awaited<ReturnType<DbPort["query"]>>;
    }

    return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
  });
  const tx = vi.fn(async (fn: (txDb: DbPort) => Promise<void>) => fn({ query, tx } as DbPort));
  return { query, tx } as DbPort;
}

describe("writePort user.upsert projection payload", () => {
  it("uses canonical integratorUserId for telegram", async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: Record<string, unknown> }[] };
    const db = makeMockDb(capture);
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

    expect(capture.projectionInserts).toHaveLength(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe("user.upserted");
    expect(ev.payload.integratorUserId).toBe("uid-tg");
    expect(ev.payload.channelCode).toBe("telegram");
    expect(ev.payload.externalId).toBe("123");
  });

  it("emits user.upserted for max with canonical integratorUserId", async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: Record<string, unknown> }[] };
    const db = makeMockDb(capture);
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

    expect(capture.projectionInserts).toHaveLength(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe("user.upserted");
    expect(ev.payload.integratorUserId).toBe("uid-max");
    expect(ev.payload.channelCode).toBe("max");
    expect(ev.payload.externalId).toBe("555123");
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
});

