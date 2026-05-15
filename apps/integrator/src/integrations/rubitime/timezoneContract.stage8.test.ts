import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const upsertIncidentMock = vi.hoisted(() => vi.fn());

vi.mock("../../infra/db/client.js", () => ({
  db: { query: queryMock },
}));

vi.mock("../../infra/db/repos/integrationDataQualityIncidents.js", () => ({
  upsertIntegrationDataQualityIncident: upsertIncidentMock,
}));

import type { DbPort } from "../../kernel/contracts/index.js";
import { stubIntegratorDrizzleForTests } from "../../infra/db/stubIntegratorDrizzleForTests.js";
import { syncAppointmentToCalendar } from "../google-calendar/sync.js";
import { createGetBranchTimezoneWithDataQuality, resetBranchTimezoneCacheForTests } from "../../infra/db/branchTimezone.js";
import { createDbWritePort } from "../../infra/db/writePort.js";
import { formatBookingRuDateTime } from "./bookingNotificationFormat.js";
import { toRubitimeIncoming } from "./connector.js";
import { normalizeRubitimeIncomingForIngest } from "./ingestNormalization.js";
import {
  STAGE8_EXPECTED_MOSCOW_UTC_ISO,
  STAGE8_EXPECTED_SAMARA_UTC_ISO,
  stage8InvalidDatetimeWebhookBody,
  stage8MoscowWebhookBody,
  stage8SamaraWebhookBody,
} from "./timezoneContract.fixtures.js";

describe("Stage 8 timezone contract (STAGE_8_CONTRACT_TESTS)", () => {
  const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    upsertIncidentMock.mockReset();
    upsertIncidentMock.mockResolvedValue({ occurrences: 1 });
    dispatchOutgoing.mockClear();
    queryMock.mockReset();
    resetBranchTimezoneCacheForTests();
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeStubDb(): DbPort {
    const query = vi.fn();
    const tx = vi.fn(async <T>(fn: (txDb: DbPort) => Promise<T>) => fn({ query, tx } as DbPort));
    return { query, tx } as unknown as DbPort;
  }

  function depsForTz(tz: string) {
    return {
      db: makeStubDb(),
      dispatchPort: { dispatchOutgoing },
      getBranchTimezone: vi.fn(async () => tz),
    };
  }

  it("S8.T01: fixtures expose same naive wall clock for Moscow and Samara scenarios", () => {
    expect(stage8MoscowWebhookBody.data.record.datetime).toBe("2026-04-07 11:00:00");
    expect(stage8SamaraWebhookBody.data.record.datetime).toBe("2026-04-07 11:00:00");
  });

  it("S8.T02: Moscow — ingest → projection ISO; bot text; DB bind would be 08:00 UTC", async () => {
    const incoming = toRubitimeIncoming(stage8MoscowWebhookBody);
    await normalizeRubitimeIncomingForIngest(incoming, depsForTz("Europe/Moscow"));
    expect(incoming.recordAt).toBe(STAGE8_EXPECTED_MOSCOW_UTC_ISO);
    expect(incoming.recordAtFormatted).toBe("07.04.2026 в 11:00");
    expect(incoming.timeNormalizationStatus).toBe("ok");

    const botMsk = formatBookingRuDateTime(incoming.recordAt ?? null, "Europe/Moscow");
    expect(botMsk).toBe("7 апр. 2026 г., 11:00");

    const capture: { appointmentParams: unknown[]; projectionRecordAt: unknown } = {
      appointmentParams: [],
      projectionRecordAt: undefined,
    };
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO public.appointment_records")) {
        capture.appointmentParams = [...params];
        capture.projectionRecordAt = params[2];
      }
      return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
    });
    const tx = vi.fn(async (fn: (txDb: DbPort) => Promise<void>) => fn({ query, tx } as DbPort));
    const db = { query, tx } as DbPort;

    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: "booking.upsert",
      params: {
        externalRecordId: "stage8-contract-moscow",
        phoneNormalized: "+79990001122",
        recordAt: STAGE8_EXPECTED_MOSCOW_UTC_ISO,
        status: "updated",
        payloadJson: {},
        lastEvent: "event-update-record",
        timeNormalizationStatus: "ok",
      },
    });
    expect(capture.appointmentParams[2]).toBe(STAGE8_EXPECTED_MOSCOW_UTC_ISO);
    expect(capture.projectionRecordAt).toBe(STAGE8_EXPECTED_MOSCOW_UTC_ISO);
  });

  it("S8.T03: Samara — UTC 07:00; MSK display 10:00; Samara display 11:00", async () => {
    const incoming = toRubitimeIncoming(stage8SamaraWebhookBody);
    await normalizeRubitimeIncomingForIngest(incoming, depsForTz("Europe/Samara"));
    expect(incoming.recordAt).toBe(STAGE8_EXPECTED_SAMARA_UTC_ISO);
    expect(incoming.recordAtFormatted).toBe("07.04.2026 в 11:00");

    const textMsk = formatBookingRuDateTime(incoming.recordAt ?? null, "Europe/Moscow");
    const textSamara = formatBookingRuDateTime(incoming.recordAt ?? null, "Europe/Samara");
    expect(textMsk).toBe("7 апр. 2026 г., 10:00");
    expect(textSamara).toBe("7 апр. 2026 г., 11:00");
  });

  it("S8.T04: invalid datetime — record not lost, recordAt cleared, incident + Telegram, GCal upsert skipped", async () => {
    upsertIncidentMock.mockResolvedValueOnce({ occurrences: 1 });
    const incoming = toRubitimeIncoming(stage8InvalidDatetimeWebhookBody);
    await normalizeRubitimeIncomingForIngest(incoming, depsForTz("Europe/Moscow"));

    expect(incoming.recordId).toBe("stage8-contract-invalid-dt");
    expect(incoming.record).toBeDefined();
    expect(incoming.recordAt).toBeUndefined();
    expect(incoming.timeNormalizationStatus).toBe("degraded");
    expect(upsertIncidentMock).toHaveBeenCalled();
    expect(dispatchOutgoing).toHaveBeenCalled();

    const upsertEvent = vi.fn();
    const deleteEvent = vi.fn();
    const mapQuery = vi.fn(async () => ({ rows: [] } as Awaited<ReturnType<DbPort["query"]>>));
    const mapTx = vi.fn(async <T>(fn: (txDb: DbPort) => Promise<T>) => fn({ query: mapQuery, tx: mapTx } as DbPort));
    const mapDb = {
      query: mapQuery,
      tx: mapTx,
      integratorDrizzle: stubIntegratorDrizzleForTests(),
    } as unknown as DbPort;

    await syncAppointmentToCalendar(
      {
        action: "created",
        rubRecordId: "stage8-contract-invalid-dt",
        record: { service_title: "Test" },
      },
      {
        client: { upsertEvent, deleteEvent },
        config: {
          enabled: true,
          clientId: "id",
          clientSecret: "sec",
          redirectUri: "uri",
          calendarId: "cal",
          refreshToken: "tok",
        },
        db: mapDb,
      },
    );
    expect(upsertEvent).not.toHaveBeenCalled();
    expect(deleteEvent).not.toHaveBeenCalled();

    const captureNull: { appointmentParams: unknown[] } = { appointmentParams: [] };
    const queryWrite = vi.fn(async (sql: string, params: unknown[]) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO public.appointment_records")) {
        captureNull.appointmentParams = [...params];
      }
      return { rows: [] } as Awaited<ReturnType<DbPort["query"]>>;
    });
    const txWrite = vi.fn(async (fn: (txDb: DbPort) => Promise<void>) =>
      fn({ query: queryWrite, tx: txWrite } as DbPort),
    );
    const dbWrite = { query: queryWrite, tx: txWrite } as DbPort;
    const writePortDegraded = createDbWritePort({ db: dbWrite });
    await writePortDegraded.writeDb({
      type: "booking.upsert",
      params: {
        externalRecordId: "stage8-contract-invalid-dt",
        phoneNormalized: "+79990001122",
        status: "updated",
        payloadJson: {},
        lastEvent: "event-create-record",
        timeNormalizationStatus: "degraded",
      },
    });
    expect(captureNull.appointmentParams[2]).toBeNull();
  });

  it("S8.T05: invalid branch IANA in DB — fallback MSK, incident + Telegram, ingest still normalizes", async () => {
    upsertIncidentMock.mockResolvedValueOnce({ occurrences: 1 });
    queryMock.mockResolvedValue({ rows: [{ timezone: "Invalid/Timezone" }] });

    const getBranchTimezone = createGetBranchTimezoneWithDataQuality({
      db: makeStubDb(),
      dispatchPort: { dispatchOutgoing },
    });

    const incoming = toRubitimeIncoming(stage8MoscowWebhookBody);
    await normalizeRubitimeIncomingForIngest(incoming, {
      db: makeStubDb(),
      dispatchPort: { dispatchOutgoing },
      getBranchTimezone,
    });

    expect(incoming.recordAt).toBe(STAGE8_EXPECTED_MOSCOW_UTC_ISO);
    expect(upsertIncidentMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        integration: "rubitime",
        entity: "branch",
        field: "branch_timezone",
        errorReason: "invalid_iana",
      }),
    );
    expect(dispatchOutgoing).toHaveBeenCalled();
  });
});
