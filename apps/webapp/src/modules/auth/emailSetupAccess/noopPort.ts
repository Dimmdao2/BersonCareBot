import type { EmailSetupAccessPort } from "./ports";

/** PHASE_02: заглушка до таблицы токенов и отправки link (PHASE_03). */
export function createNoopEmailSetupAccessPort(): EmailSetupAccessPort {
  return {
    async requestContactEmailSetup() {
      return { ok: true, status: "stub_pending_phase3" };
    },
  };
}
