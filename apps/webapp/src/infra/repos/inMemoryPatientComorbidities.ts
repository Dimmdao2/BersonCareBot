/**
 * In-memory implementation of PatientComorbiditiesPort — for Vitest / CI without a DB.
 */

import { randomUUID } from "node:crypto";
import type {
  AddComorbidityInput,
  Comorbidity,
  EditComorbidityTextInput,
  PatientComorbiditiesPort,
} from "@/modules/patient-comorbidities/ports";

type ComorbidityRow = {
  id: string;
  patientUserId: string;
  text: string;
  since: string | null;
  status: "active" | "removed";
  createdBy: string;
  createdAt: string;
  removedAt: string | null;
};

const rows: ComorbidityRow[] = [];

/** @internal Vitest: reset between tests. */
export function __resetInMemoryPatientComorbiditiesForTest() {
  rows.length = 0;
}

function toComorbidity(r: ComorbidityRow): Comorbidity {
  return {
    id: r.id,
    text: r.text,
    since: r.since,
    status: r.status,
    createdAt: r.createdAt,
    removedAt: r.removedAt,
  };
}

export const inMemoryPatientComorbiditiesPort: PatientComorbiditiesPort = {
  async listByPatient(
    patientUserId: string,
    status: "active" | "removed" | "all",
  ): Promise<Comorbidity[]> {
    return rows
      .filter(
        (r) =>
          r.patientUserId === patientUserId &&
          (status === "all" || r.status === status),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(toComorbidity);
  },

  async add(input: AddComorbidityInput): Promise<Comorbidity> {
    const row: ComorbidityRow = {
      id: randomUUID(),
      patientUserId: input.patientUserId,
      text: input.text,
      since: input.since ?? null,
      status: "active",
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      removedAt: null,
    };
    rows.push(row);
    return toComorbidity(row);
  },

  async editText(input: EditComorbidityTextInput): Promise<boolean> {
    const row = rows.find(
      (r) => r.id === input.comorbidityId && r.patientUserId === input.patientUserId,
    );
    if (!row) return false;
    if (input.text !== undefined) row.text = input.text;
    if (input.since !== undefined) row.since = input.since ?? null;
    return true;
  },

  async markRemoved(patientUserId: string, comorbidityId: string): Promise<boolean> {
    const row = rows.find(
      (r) => r.id === comorbidityId && r.patientUserId === patientUserId,
    );
    if (!row || row.status === "removed") return false;
    row.status = "removed";
    row.removedAt = new Date().toISOString();
    return true;
  },

  async restore(patientUserId: string, comorbidityId: string): Promise<boolean> {
    const row = rows.find(
      (r) => r.id === comorbidityId && r.patientUserId === patientUserId,
    );
    if (!row || row.status === "active") return false;
    row.status = "active";
    row.removedAt = null;
    return true;
  },
};
