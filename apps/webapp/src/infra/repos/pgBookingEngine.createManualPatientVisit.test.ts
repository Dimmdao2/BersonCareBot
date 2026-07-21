import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  beAppointmentEvents,
  beAppointmentHistoryEvents,
  beAppointments,
  beBranches,
  beClinicServices,
  bePatientTimelineEvents,
  beRooms,
  beSpecialists,
  beSpecialistServiceAvailability,
  orgEnrollments,
} from "../../../db/schema/bookingEngine";
import { clinicalVisit } from "../../../db/schema/patientClinical";
import { manualPatientCommands } from "../../../db/schema/manualPatientCommands";
import { platformUsers } from "../../../db/schema/schema";
import type { CreateManualPatientVisitInput } from "@/modules/booking-engine/types";

const getDrizzleMock = vi.hoisted(() => vi.fn());
const getCurrentDbPrincipalOrganizationIdMock = vi.hoisted(() => vi.fn());
const resolveIdentityMock = vi.hoisted(() => vi.fn());
const ensureRelationshipMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/db/drizzle", () => ({ getDrizzle: getDrizzleMock }));
vi.mock("@bersoncare/db-principal", () => ({
  getCurrentDbPrincipalOrganizationId: getCurrentDbPrincipalOrganizationIdMock,
}));
vi.mock("@/infra/repos/pgDoctorClientCreate", () => ({
  resolveOrCreateDoctorClientByPhoneInTransaction: resolveIdentityMock,
}));
vi.mock("@/infra/repos/pgPatientOrganizationEnrollment", () => ({
  ensureInvitedOrganizationClientRelationship: ensureRelationshipMock,
}));

import { createPgBookingEnginePort } from "./pgBookingEngine";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "99999999-9999-4999-8999-999999999999";
const PATIENT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_PATIENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMMAND_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_COMMAND_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SPECIALIST_ID = "55555555-5555-4555-8555-555555555555";
const ACTOR_ID = "77777777-7777-4777-8777-777777777777";

const scheduledInput: Extract<CreateManualPatientVisitInput, { kind: "scheduled" }> = {
  organizationId: ORG_ID,
  commandId: COMMAND_ID,
  lastName: "Новый",
  firstName: "Пациент",
  patronymic: null,
  phoneNormalized: "+79990000000",
  emailRaw: null,
  emailNormalized: null,
  kind: "scheduled",
  appointment: {
    branchId: "44444444-4444-4444-8444-444444444444",
    specialistId: SPECIALIST_ID,
    serviceId: "66666666-6666-4666-8666-666666666666",
    startAt: "2026-07-20T10:00:00.000Z",
    endAt: "2026-07-20T11:00:00.000Z",
    durationMinutes: 60,
    source: "admin_manual",
    status: "confirmed",
    actorId: ACTOR_ID,
  },
};

function walkInInput(commandId = COMMAND_ID): CreateManualPatientVisitInput {
  return {
    organizationId: ORG_ID,
    commandId,
    lastName: "Новый",
    firstName: "Пациент",
    patronymic: null,
    phoneNormalized: "+79990000000",
    emailRaw: null,
    emailNormalized: null,
    kind: "walk_in",
    walkIn: {
      specialistId: SPECIALIST_ID,
      visitedAt: "2026-07-20T09:30:00.000Z",
      actorId: ACTOR_ID,
    },
  };
}

type VisitRow = {
  id: string;
  organizationId: string;
  patientUserId: string;
  visitType: "first" | "repeat";
  visitedAt: string;
  canonicalAppointmentId: null;
  createdBy: string;
};

function createHarness(
  commandIds: string[],
  options?: { missingBranch?: boolean; contactlessPatient?: boolean },
) {
  const appointments = new Map<string, Record<string, unknown>>();
  const visits = new Map<string, VisitRow>();
  const commands = new Map<string, Record<string, unknown>>();
  const insertOrder: string[] = [];
  let activeCommandId: string | null = null;
  let activeOrganizationId: string | null = null;
  let activeKind: "scheduled" | "walk_in" | null = null;
  let queue = Promise.resolve();
  let relationshipLockCount = 0;

  const patientRow = () => ({
    userId: PATIENT_ID,
    displayName: "Новый Пациент",
    lastName: "Новый",
    firstName: "Пациент",
    patronymic: null,
    phoneNormalized: options?.contactlessPatient ? null : "+79990000000",
  });

  const rowsFor = (table: unknown, selection: unknown): unknown[] => {
    if (table === manualPatientCommands) {
      const row = activeCommandId ? commands.get(activeCommandId) : undefined;
      return row && row.organizationId === activeOrganizationId ? [row] : [];
    }
    if (table === beAppointments) {
      activeKind ??= "walk_in";
      const row = activeCommandId ? appointments.get(activeCommandId) : undefined;
      return row && row.organizationId === activeOrganizationId ? [row] : [];
    }
    if (table === beSpecialists) return [{ id: SPECIALIST_ID }];
    if (table === beBranches) {
      return options?.missingBranch ? [] : [{ id: scheduledInput.appointment.branchId }];
    }
    if (table === beRooms) return [{ id: "room-id" }];
    if (table === beClinicServices) return [{ id: scheduledInput.appointment.serviceId }];
    if (table === beSpecialistServiceAvailability) return [{ id: "availability-id" }];
    if (table === orgEnrollments) return [{ status: "invited" }];
    if (table === platformUsers) return [patientRow()];
    if (table === clinicalVisit) {
      activeKind ??= "scheduled";
      const fields = selection && typeof selection === "object"
        ? Object.keys(selection as Record<string, unknown>)
        : [];
      if (fields.includes("patientUserId")) {
        const row = activeCommandId ? visits.get(activeCommandId) : undefined;
        return row && row.organizationId === activeOrganizationId ? [row] : [];
      }
      if (activeKind === "scheduled") {
        const row = activeCommandId ? visits.get(activeCommandId) : undefined;
        return row && row.organizationId === activeOrganizationId ? [row] : [];
      }
      return [...visits.values()].filter(
        (row) => row.organizationId === activeOrganizationId && row.patientUserId === PATIENT_ID,
      );
    }
    return [];
  };

  const select = vi.fn((selection?: unknown) => ({
    from: (table: unknown) => ({
      where: () => {
        const rows = () => rowsFor(table, selection);
        return {
          limit: vi.fn(async () => rows()),
          for: vi.fn(async () => {
            if (table === orgEnrollments) relationshipLockCount += 1;
            return rows();
          }),
        };
      },
    }),
  }));

  const insert = vi.fn((table: unknown) => ({
    values: vi.fn((values: Record<string, unknown>) => {
      if (table === beAppointments) {
        insertOrder.push("appointment");
        if (appointments.has(String(values.id))) {
          throw Object.assign(new Error("duplicate"), {
            code: "23505",
            constraint: "be_appointments_pkey",
          });
        }
        const row = {
          id: values.id,
          organizationId: values.organizationId,
          branchId: values.branchId ?? null,
          roomId: values.roomId ?? null,
          specialistId: values.specialistId ?? null,
          serviceId: values.serviceId ?? null,
          platformUserId: values.platformUserId ?? null,
          startAt: values.startAt,
          endAt: values.endAt,
          durationMinutes: values.durationMinutes,
          chainId: null,
          chainPosition: null,
          source: values.source,
          status: values.status,
          originalStartAt: values.startAt,
          rescheduleCount: 0,
          paymentRef: null,
          packageUsageRef: null,
          phoneNormalized: values.phoneNormalized,
          attributionJson: values.attributionJson,
        };
        appointments.set(String(values.id), row);
        return { returning: async () => [row] };
      }
      if (table === clinicalVisit) {
        if (visits.has(String(values.id))) {
          throw Object.assign(new Error("duplicate"), {
            code: "23505",
            constraint: "clinical_visit_pkey",
          });
        }
        const row = values as VisitRow;
        visits.set(String(values.id), row);
        insertOrder.push(`visit:${row.visitType}`);
        return { returning: async () => [{ id: row.id }] };
      }
      if (table === manualPatientCommands) {
        const commandId = String(values.commandId);
        if (commands.has(commandId)) {
          throw Object.assign(new Error("duplicate"), {
            code: "23505",
            constraint: "manual_patient_commands_pkey",
          });
        }
        commands.set(commandId, values);
      }
      if (table === beAppointmentEvents) insertOrder.push("event");
      if (table === beAppointmentHistoryEvents) insertOrder.push("history");
      if (table === bePatientTimelineEvents) insertOrder.push("timeline");
      return Promise.resolve();
    }),
  }));

  const execute = vi.fn().mockResolvedValue(undefined);
  const tx = { execute, insert, select };
  const transaction = vi.fn((fn: (value: typeof tx) => unknown) => {
    const commandId = commandIds.shift();
    if (!commandId) throw new Error("test_command_id_missing");
    const run = queue.then(async () => {
      activeCommandId = commandId;
      activeOrganizationId = getCurrentDbPrincipalOrganizationIdMock();
      activeKind = null;
      try {
        return await fn(tx);
      } finally {
        activeCommandId = null;
        activeOrganizationId = null;
        activeKind = null;
      }
    });
    queue = run.then(() => undefined, () => undefined);
    return run;
  });
  getDrizzleMock.mockReturnValue({ transaction });
  return {
    appointments,
    visits,
    commands,
    insertOrder,
    transaction,
    execute,
    get relationshipLockCount() {
      return relationshipLockCount;
    },
  };
}

describe("pgBookingEngine.createManualPatientVisit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(ORG_ID);
    resolveIdentityMock.mockImplementation(async (_tx, _organizationId, identity) => ({
      userId: identity.phoneNormalized === "+78880000000" ? OTHER_PATIENT_ID : PATIENT_ID,
      displayName: "Новый Пациент",
      lastName: identity.lastName,
      firstName: identity.firstName,
      patronymic: identity.patronymic,
      phoneNormalized: identity.phoneNormalized,
      created: true,
    }));
    ensureRelationshipMock.mockResolvedValue("invited");
  });

  it("writes a scheduled appointment and relationship in one transaction", async () => {
    const harness = createHarness([COMMAND_ID]);

    const result = await createPgBookingEnginePort().createManualPatientVisit(scheduledInput);

    expect(harness.transaction).toHaveBeenCalledOnce();
    expect(harness.execute).toHaveBeenCalledOnce();
    expect(resolveIdentityMock).toHaveBeenCalledOnce();
    expect(ensureRelationshipMock).toHaveBeenCalledOnce();
    expect(harness.insertOrder).toEqual(["appointment", "event", "history", "timeline"]);
    expect(result).toMatchObject({
      kind: "scheduled",
      replayed: false,
      clinicalVisitId: null,
      appointment: { id: COMMAND_ID },
    });
  });

  it("replays a scheduled command by its stored semantic fingerprint", async () => {
    const harness = createHarness([COMMAND_ID, COMMAND_ID]);
    const port = createPgBookingEnginePort();

    const first = await port.createManualPatientVisit(scheduledInput);
    const replay = await port.createManualPatientVisit(scheduledInput);

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(harness.appointments.size).toBe(1);
    expect(harness.insertOrder).toEqual(["appointment", "event", "history", "timeline"]);
    expect(harness.execute).toHaveBeenCalledTimes(2);
  });

  it("rejects reuse of a scheduled command UUID with a changed payload", async () => {
    const harness = createHarness([COMMAND_ID, COMMAND_ID]);
    const port = createPgBookingEnginePort();
    await port.createManualPatientVisit(scheduledInput);

    await expect(
      port.createManualPatientVisit({
        ...scheduledInput,
        appointment: {
          ...scheduledInput.appointment,
          startAt: "2026-07-20T12:00:00.000Z",
          endAt: "2026-07-20T13:00:00.000Z",
        },
      }),
    ).rejects.toThrow("idempotency_conflict");

    expect(harness.appointments.size).toBe(1);
    expect(harness.insertOrder).toEqual(["appointment", "event", "history", "timeline"]);
  });

  it("rejects scheduled reuse of a walk-in command UUID in the same organization", async () => {
    const harness = createHarness([COMMAND_ID, COMMAND_ID]);
    const port = createPgBookingEnginePort();
    await port.createManualPatientVisit(walkInInput());

    await expect(port.createManualPatientVisit(scheduledInput)).rejects.toThrow(
      "idempotency_conflict",
    );

    expect(harness.visits.size).toBe(1);
    expect(harness.appointments.size).toBe(0);
    expect(harness.insertOrder).toEqual(["visit:first"]);
  });

  it("rejects walk-in reuse of a scheduled command UUID in the same organization", async () => {
    const harness = createHarness([COMMAND_ID, COMMAND_ID]);
    const port = createPgBookingEnginePort();
    await port.createManualPatientVisit(scheduledInput);

    await expect(port.createManualPatientVisit(walkInInput())).rejects.toThrow(
      "idempotency_conflict",
    );

    expect(harness.appointments.size).toBe(1);
    expect(harness.visits.size).toBe(0);
    expect(harness.insertOrder).toEqual(["appointment", "event", "history", "timeline"]);
  });

  it("rejects a mismatched organization before opening the transaction", async () => {
    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(OTHER_ORG_ID);
    await expect(createPgBookingEnginePort().createManualPatientVisit(scheduledInput)).rejects.toThrow(
      "organization_principal_mismatch",
    );
    expect(getDrizzleMock).not.toHaveBeenCalled();
  });

  it("rejects an exact-org catalog mismatch before creating identity", async () => {
    createHarness([COMMAND_ID], { missingBranch: true });
    await expect(createPgBookingEnginePort().createManualPatientVisit(scheduledInput)).rejects.toThrow(
      "branch_not_found",
    );
    expect(resolveIdentityMock).not.toHaveBeenCalled();
  });

  it("creates only a truthful clinical visit for a walk-in", async () => {
    const harness = createHarness([COMMAND_ID]);

    const result = await createPgBookingEnginePort().createManualPatientVisit(walkInInput());

    expect(harness.appointments.size).toBe(0);
    expect([...harness.visits.values()]).toEqual([
      expect.objectContaining({
        id: COMMAND_ID,
        organizationId: ORG_ID,
        patientUserId: PATIENT_ID,
        visitType: "first",
        visitedAt: "2026-07-20T09:30:00.000Z",
        canonicalAppointmentId: null,
        createdBy: ACTOR_ID,
      }),
    ]);
    expect(result).toMatchObject({
      kind: "walk_in",
      replayed: false,
      appointment: null,
      clinicalVisitId: COMMAND_ID,
    });
  });

  it("replays the same walk-in command sequentially without a duplicate visit", async () => {
    const harness = createHarness([COMMAND_ID, COMMAND_ID]);
    const port = createPgBookingEnginePort();

    const first = await port.createManualPatientVisit(walkInInput());
    const replay = await port.createManualPatientVisit(walkInInput());

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(harness.visits.size).toBe(1);
    expect(harness.insertOrder).toEqual(["visit:first"]);
  });

  it("replays a contactless walk-in before creating a second placeholder identity", async () => {
    const harness = createHarness([COMMAND_ID, COMMAND_ID], { contactlessPatient: true });
    const port = createPgBookingEnginePort();
    const input = { ...walkInInput(), phoneNormalized: null };

    const first = await port.createManualPatientVisit(input);
    const replay = await port.createManualPatientVisit(input);

    expect(first).toMatchObject({ replayed: false, patient: { phoneNormalized: null } });
    expect(replay).toMatchObject({ replayed: true, patient: { phoneNormalized: null } });
    expect(resolveIdentityMock).toHaveBeenCalledTimes(1);
    expect(harness.visits.size).toBe(1);
  });

  it("converges concurrent retries under the command-lock unit harness", async () => {
    const harness = createHarness([COMMAND_ID, COMMAND_ID]);
    const port = createPgBookingEnginePort();

    const results = await Promise.all([
      port.createManualPatientVisit(walkInInput()),
      port.createManualPatientVisit(walkInInput()),
    ]);

    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(harness.visits.size).toBe(1);
    expect(harness.execute).toHaveBeenCalledTimes(2);
    expect(harness.relationshipLockCount).toBe(1);
  });

  it("classifies different commands as first then repeat under the relationship-lock unit harness", async () => {
    const harness = createHarness([COMMAND_ID, OTHER_COMMAND_ID]);
    const port = createPgBookingEnginePort();

    await Promise.all([
      port.createManualPatientVisit(walkInInput(COMMAND_ID)),
      port.createManualPatientVisit(walkInInput(OTHER_COMMAND_ID)),
    ]);

    expect([...harness.visits.values()].map((row) => row.visitType)).toEqual(["first", "repeat"]);
    expect(harness.execute).toHaveBeenCalledTimes(2);
    expect(harness.relationshipLockCount).toBe(2);
  });

  it("fails a same-command retry for another patient without another visit", async () => {
    const harness = createHarness([COMMAND_ID, COMMAND_ID]);
    const port = createPgBookingEnginePort();
    await port.createManualPatientVisit(walkInInput());

    await expect(
      port.createManualPatientVisit({
        ...walkInInput(),
        phoneNormalized: "+78880000000",
      }),
    ).rejects.toThrow("idempotency_conflict");

    expect(harness.visits.size).toBe(1);
    expect([...harness.visits.values()][0]?.patientUserId).toBe(PATIENT_ID);
  });

  it("fails closed when another organization already owns the command UUID", async () => {
    const harness = createHarness([COMMAND_ID, COMMAND_ID]);
    const port = createPgBookingEnginePort();
    await port.createManualPatientVisit(walkInInput());

    getCurrentDbPrincipalOrganizationIdMock.mockReturnValue(OTHER_ORG_ID);
    await expect(
      port.createManualPatientVisit({ ...walkInInput(), organizationId: OTHER_ORG_ID }),
    ).rejects.toThrow("idempotency_conflict");

    expect(harness.visits.size).toBe(1);
    expect([...harness.visits.values()][0]?.organizationId).toBe(ORG_ID);
  });
});
