/**
 * Patient Comorbidities service — orchestrates port calls + input validation.
 * No DB/infra imports; receives port via DI.
 */

import type {
  AddComorbidityInput,
  Comorbidity,
  EditComorbidityTextInput,
  PatientComorbiditiesPort,
} from "./ports";

export type PatientComorbiditiesServiceDeps = {
  patientComorbiditiesPort: PatientComorbiditiesPort;
};

export function createPatientComorbiditiesService({
  patientComorbiditiesPort,
}: PatientComorbiditiesServiceDeps) {
  return {
    /** Список активных заболеваний (вкладка «Текущие»). */
    async listActive(patientUserId: string): Promise<Comorbidity[]> {
      return patientComorbiditiesPort.listByPatient(patientUserId, "active");
    },

    /** Список снятых заболеваний (вкладка «Снятые»). */
    async listRemoved(patientUserId: string): Promise<Comorbidity[]> {
      return patientComorbiditiesPort.listByPatient(patientUserId, "removed");
    },

    /** Добавить сопутствующее заболевание. */
    async add(input: AddComorbidityInput): Promise<Comorbidity> {
      const text = input.text.trim();
      if (!text) throw new Error("comorbidity_text_required");
      const since = input.since != null ? input.since.trim() || null : null;
      return patientComorbiditiesPort.add({ ...input, text, since });
    },

    /**
     * Редактировать текст (и опционально since).
     * false — запись не найдена или принадлежит другому пациенту.
     */
    async editText(input: EditComorbidityTextInput): Promise<boolean> {
      const patch: EditComorbidityTextInput = {
        patientUserId: input.patientUserId,
        comorbidityId: input.comorbidityId,
      };
      if (input.text !== undefined) {
        const text = input.text.trim();
        if (!text) throw new Error("comorbidity_text_required");
        patch.text = text;
      }
      if (input.since !== undefined) {
        patch.since = input.since != null ? input.since.trim() || null : null;
      }
      if (patch.text === undefined && patch.since === undefined) {
        throw new Error("nothing_to_update");
      }
      return patientComorbiditiesPort.editText(patch);
    },

    /**
     * Снять сопутствующее заболевание (переместить в «Снятые»).
     * false — запись не найдена или уже снята.
     */
    async markRemoved(patientUserId: string, comorbidityId: string): Promise<boolean> {
      return patientComorbiditiesPort.markRemoved(patientUserId, comorbidityId);
    },

    /**
     * Восстановить снятое заболевание (вернуть в «Текущие»).
     * false — запись не найдена или уже активна.
     */
    async restore(patientUserId: string, comorbidityId: string): Promise<boolean> {
      return patientComorbiditiesPort.restore(patientUserId, comorbidityId);
    },
  };
}

export type PatientComorbiditiesService = ReturnType<typeof createPatientComorbiditiesService>;
