import { extractBroadcastBodyContent } from "@/modules/patient-broadcasts/extractBroadcastBodyContent";
import type { PatientBroadcastsPort } from "@/modules/patient-broadcasts/ports";
import { isInMemoryBroadcastRecipient } from "./inMemoryBroadcastRecipients";

type AuditRow = {
  messageTitle: string;
  messageBody: string;
  executedAt: string;
  previewOnly: boolean;
};

const auditById = new Map<string, AuditRow>();

export function registerInMemoryBroadcastAuditForPatientRead(
  auditId: string,
  row: Omit<AuditRow, "previewOnly"> & { previewOnly?: boolean },
): void {
  auditById.set(auditId, {
    messageTitle: row.messageTitle,
    messageBody: row.messageBody,
    executedAt: row.executedAt,
    previewOnly: row.previewOnly ?? false,
  });
}

export const inMemoryPatientBroadcastsPort: PatientBroadcastsPort = {
  async getBroadcastForPatient(auditId, platformUserId) {
    if (!isInMemoryBroadcastRecipient(auditId, platformUserId)) return null;
    const row = auditById.get(auditId);
    if (!row || row.previewOnly) return null;
    const title = row.messageTitle.trim();
    return {
      title,
      body: extractBroadcastBodyContent(title, row.messageBody),
      executedAt: row.executedAt,
    };
  },
};
