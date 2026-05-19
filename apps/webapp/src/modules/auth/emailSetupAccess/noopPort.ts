import type { EmailSetupAccessPort } from "./ports";

/** In-memory / tests without PG: setup enqueue returns stub status. */
export function createNoopEmailSetupAccessPort(): EmailSetupAccessPort {
  return {
    async requestContactEmailSetup() {
      return { ok: true, status: "stub_pending_phase3" };
    },
  };
}
