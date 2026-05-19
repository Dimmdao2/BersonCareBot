import type { EmailSetupAccessSource } from "@/modules/auth/emailSetupAccess/ports";

export type IssueEmailSetupTokenParams = {
  userId: string;
  emailNormalized: string;
  tokenHash: string;
  expiresAtIso: string;
  source: EmailSetupAccessSource;
  createdByUserId?: string | null;
};

export type EmailSetupTokenRow = {
  id: string;
  userId: string;
  emailNormalized: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
};

export type EmailSetupTokensPort = {
  revokeActiveForUserEmail(userId: string, emailNormalized: string): Promise<void>;
  insertToken(params: IssueEmailSetupTokenParams): Promise<{ id: string }>;
  deleteTokenById(id: string): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<EmailSetupTokenRow | null>;
  markUsedById(id: string): Promise<boolean>;
};
