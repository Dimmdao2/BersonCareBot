import type { EmailSetupFlowPort } from "./ports";

export const noopEmailSetupFlowPort: EmailSetupFlowPort = {
  async assertContactEmailForSetup() {
    return { ok: false, reason: "user_not_found" };
  },
  async applyEmailSetupCompletion() {
    return { ok: false, reason: "user_not_found" };
  },
};
