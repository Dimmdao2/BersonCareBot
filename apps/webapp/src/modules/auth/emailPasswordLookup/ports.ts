import type { EmailPasswordAuthState } from "./types";

export type EmailPasswordLookupPort = {
  resolveAuthState(emailNormalized: string): Promise<EmailPasswordAuthState>;
};
