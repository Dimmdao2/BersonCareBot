import { describe, expect, it } from "vitest";
import {
  inMemoryPatientBroadcastsPort,
  registerInMemoryBroadcastAuditForPatientRead,
} from "@/infra/repos/inMemoryPatientBroadcasts";
import { setInMemoryBroadcastRecipients } from "@/infra/repos/inMemoryBroadcastRecipients";

const auditId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const userId = "11111111-2222-4333-8444-555555555555";

describe("getBroadcastForPatient (in-memory)", () => {
  it("returns view for recipient with body extracted from combined message_body", async () => {
    registerInMemoryBroadcastAuditForPatientRead(auditId, {
      messageTitle: "Заголовок",
      messageBody: "Заголовок\n\nПолный текст рассылки для пациента.",
      executedAt: "2026-05-27T10:00:00.000Z",
    });
    setInMemoryBroadcastRecipients(auditId, [userId]);

    const view = await inMemoryPatientBroadcastsPort.getBroadcastForPatient(auditId, userId);
    expect(view).toEqual({
      title: "Заголовок",
      body: "Полный текст рассылки для пациента.",
      executedAt: "2026-05-27T10:00:00.000Z",
    });
  });

  it("returns null for non-recipient", async () => {
    registerInMemoryBroadcastAuditForPatientRead(auditId, {
      messageTitle: "T",
      messageBody: "T\n\nB",
      executedAt: "2026-05-27T10:00:00.000Z",
    });
    setInMemoryBroadcastRecipients(auditId, [userId]);

    const view = await inMemoryPatientBroadcastsPort.getBroadcastForPatient(
      auditId,
      "99999999-9999-4999-8999-999999999999",
    );
    expect(view).toBeNull();
  });

  it("returns null for preview_only audit", async () => {
    const previewId = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
    registerInMemoryBroadcastAuditForPatientRead(previewId, {
      messageTitle: "Preview",
      messageBody: "Preview\n\nSecret",
      executedAt: "2026-05-27T10:00:00.000Z",
      previewOnly: true,
    });
    setInMemoryBroadcastRecipients(previewId, [userId]);

    expect(await inMemoryPatientBroadcastsPort.getBroadcastForPatient(previewId, userId)).toBeNull();
  });
});
