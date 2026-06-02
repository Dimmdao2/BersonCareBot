import { afterEach, describe, expect, it } from "vitest";
import {
  __resetInMemoryDoctorClientsForTest,
  inMemoryDoctorClientsPort,
} from "./inMemoryDoctorClients";
import type { ClientListItem } from "@/modules/doctor-clients/ports";

const STUB: ClientListItem[] = [
  {
    userId: "11111111-1111-4111-8111-111111111111",
    displayName: "On support",
    phone: null,
    bindings: {},
    nextAppointmentLabel: null,
    activeTreatmentProgram: true,
    activeTreatmentProgramInstanceId: "prog-1",
    cancellationCount30d: 0,
  },
  {
    userId: "22222222-2222-4222-8222-222222222222",
    displayName: "Program no support",
    phone: null,
    bindings: {},
    nextAppointmentLabel: null,
    activeTreatmentProgram: true,
    activeTreatmentProgramInstanceId: "prog-2",
    cancellationCount30d: 0,
  },
  {
    userId: "33333333-3333-4333-8333-333333333333",
    displayName: "No program",
    phone: null,
    bindings: {},
    nextAppointmentLabel: null,
    activeTreatmentProgram: false,
    activeTreatmentProgramInstanceId: null,
    cancellationCount30d: 0,
  },
];

describe("inMemoryDoctorClientsPort supportStatus filters", () => {
  afterEach(() => {
    __resetInMemoryDoctorClientsForTest();
  });

  it("filters on and programWithoutSupport", async () => {
    __resetInMemoryDoctorClientsForTest(STUB);
    await inMemoryDoctorClientsPort.updateClientSupport({
      patientUserId: STUB[0]!.userId,
      onSupport: true,
      actorId: "doc-1",
    });
    await inMemoryDoctorClientsPort.updateClientSupport({
      patientUserId: STUB[1]!.userId,
      onSupport: false,
      actorId: "doc-1",
    });

    const onList = await inMemoryDoctorClientsPort.listClients({ supportStatus: "on" });
    expect(onList.map((c) => c.userId)).toEqual([STUB[0]!.userId]);

    const withoutList = await inMemoryDoctorClientsPort.listClients({
      supportStatus: "programWithoutSupport",
    });
    expect(withoutList.map((c) => c.userId)).toEqual([STUB[1]!.userId]);
  });
});
