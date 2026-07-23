import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  runWithDbOrganizationPrincipal,
  runWithDbPatientPrincipal,
} from "@bersoncare/db-principal";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const runDrizzleMutationTransactionMock = vi.hoisted(() =>
  vi.fn((fn: (tx: unknown) => unknown) => fn({ __tx: true })),
);
const runMergeLegacySupportConversationsMock = vi.hoisted(() => vi.fn());
const getPoolMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: runWebappPgTextMock,
}));

vi.mock("@/infra/db/drizzleMutationTx", () => ({
  runDrizzleMutationTransaction: runDrizzleMutationTransactionMock,
}));

vi.mock("@/infra/db/client", () => ({
  getPool: getPoolMock,
}));

vi.mock("@/infra/repos/mergeLegacySupportConversations", () => ({
  mergeLegacySupportConversationsForPlatformUser: runMergeLegacySupportConversationsMock,
}));

import { createPgSupportCommunicationPort } from "./pgSupportCommunication";

const TS = "2025-06-01T10:00:00.000Z";
const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("createPgSupportCommunicationPort", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
    runDrizzleMutationTransactionMock.mockClear();
    runMergeLegacySupportConversationsMock.mockReset();
    getPoolMock.mockReset();
  });

  describe("upsertConversationFromProjection", () => {
    it("uses ON CONFLICT and skips canonical lookup when integratorUserId empty", async () => {
      runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: "conv-1" }] });
      const port = createPgSupportCommunicationPort();
      const result = await port.upsertConversationFromProjection({
        integratorConversationId: "conv-a",
        integratorUserId: null,
        source: "telegram",
        adminScope: "support",
        status: "open",
        openedAt: TS,
        lastMessageAt: TS,
      });
      expect(result.id).toBe("conv-1");
      expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
      const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
      expect(sql).toContain("ON CONFLICT (integrator_conversation_id)");
      expect(runWebappPgTextMock.mock.calls[0]?.[1]?.[1]).toBeNull();
    });

    it("resolves platform_user_id via platform_users when integratorUserId set", async () => {
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [{ id: "pu-1" }] })
        .mockResolvedValueOnce({ rows: [{ id: "conv-2" }] });
      const port = createPgSupportCommunicationPort();
      await port.upsertConversationFromProjection({
        integratorConversationId: "conv-b",
        integratorUserId: "42",
        source: "telegram",
        adminScope: "",
        status: "open",
        openedAt: TS,
        lastMessageAt: TS,
      });
      expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
      const lookupSql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
      expect(lookupSql).toContain("platform_users");
      expect(lookupSql).toContain("merged_into_id IS NULL");
      expect(runWebappPgTextMock.mock.calls[1]?.[1]?.[1]).toBe("pu-1");
    });
  });

  describe("setConversationStatusFromProjection", () => {
    it("falls back to INSERT when UPDATE rowCount is 0", async () => {
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const port = createPgSupportCommunicationPort();
      await port.setConversationStatusFromProjection({
        integratorConversationId: "missing-conv",
        status: "closed",
        closedAt: TS,
        closeReason: "resolved",
      });
      expect(runWebappPgTextMock).toHaveBeenCalledTimes(2);
      const fallbackSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
      expect(fallbackSql).toContain("INSERT INTO support_conversations");
      expect(fallbackSql).toContain("ON CONFLICT (integrator_conversation_id)");
    });
  });

  describe("appendDeliveryEventFromProjection", () => {
    const clinicA = "10000000-0000-4000-8000-000000000001";
    const clinicB = "20000000-0000-4000-8000-000000000002";
    const params = {
      organizationId: clinicA,
      conversationMessageId: null,
      integratorIntentEventId: "evt-org-1",
      correlationId: "corr-org-1",
      channelCode: "web_push",
      status: "success",
      attempt: 1,
      reason: null,
      payloadJson: {},
      occurredAt: TS,
    };

    it("inserts the verified organization under the matching principal", async () => {
      runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ id: "delivery-1" }] });
      const port = createPgSupportCommunicationPort();

      await expect(
        runWithDbOrganizationPrincipal(clinicA, () =>
          port.appendDeliveryEventFromProjection(params),
        ),
      ).resolves.toEqual({ id: "delivery-1" });

      const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
      expect(sql).toContain("organization_id");
      expect(sql).toContain("$1::uuid");
      expect(runWebappPgTextMock.mock.calls[0]?.[1]?.[0]).toBe(clinicA);
    });

    it("rejects a cross-organization write before SQL", async () => {
      const port = createPgSupportCommunicationPort();

      await expect(
        runWithDbOrganizationPrincipal(clinicB, () =>
          port.appendDeliveryEventFromProjection(params),
        ),
      ).rejects.toThrow("organization_principal_mismatch");
      expect(runWebappPgTextMock).not.toHaveBeenCalled();
    });

    it("rejects the projection write without an organization principal", async () => {
      const port = createPgSupportCommunicationPort();

      await expect(port.appendDeliveryEventFromProjection(params))
        .rejects.toThrow("organization_principal_required");
      expect(runWebappPgTextMock).not.toHaveBeenCalled();
    });
  });

  describe("listOpenConversationsForAdmin", () => {
    it("passes normalized source, limit and unreadOnly as bound params", async () => {
      runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
      const port = createPgSupportCommunicationPort();
      await port.listOpenConversationsForAdmin({ source: "  telegram  ", limit: 200, unreadOnly: true, organizationId: ORG_ID });
      const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
      expect(sql).toContain("sc.status <> 'closed'");
      expect(sql).toContain("last_personal.personal_msg_at IS NOT NULL");
      expect(sql).toContain("$1::text IS NULL OR sc.source = $1");
      expect(sql).toContain("$3::boolean = false OR");
      expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["telegram", 100, true, ORG_ID]);
    });

    it("uses null source when filter omitted", async () => {
      runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
      const port = createPgSupportCommunicationPort();
      await port.listOpenConversationsForAdmin({ limit: 10, organizationId: ORG_ID });
      expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([null, 10, false, ORG_ID]);
    });

    it("uses full structured FIO for communications while retaining a legacy label fallback", async () => {
      runWebappPgTextMock.mockResolvedValueOnce({
        rows: [
          {
            conversation_id: "conv-1",
            integrator_conversation_id: "int-conv-1",
            source: "telegram",
            integrator_user_id: "42",
            admin_scope: "support",
            status: "open",
            opened_at: TS,
            last_message_at: TS,
            closed_at: null,
            close_reason: null,
            display_name: "Legacy label",
            first_name: "Ivan",
            last_name: "Petrov",
            patronymic: "Sergeevich",
            phone_normalized: null,
            channel_external_id: null,
            last_message_text: "",
            last_sender_role: "user",
            unread_from_user_count: 0,
          },
          {
            conversation_id: "conv-2",
            integrator_conversation_id: "int-conv-2",
            source: "telegram",
            integrator_user_id: "43",
            admin_scope: "support",
            status: "open",
            opened_at: TS,
            last_message_at: TS,
            closed_at: null,
            close_reason: null,
            display_name: "Legacy only",
            first_name: null,
            last_name: null,
            patronymic: null,
            phone_normalized: null,
            channel_external_id: null,
            last_message_text: "",
            last_sender_role: "user",
            unread_from_user_count: 0,
          },
        ],
      });
      const port = createPgSupportCommunicationPort();

      const rows = await port.listOpenConversationsForAdmin({ organizationId: ORG_ID });

      expect(rows.map((row) => row.displayName)).toEqual(["Petrov Ivan Sergeevich", "Legacy only"]);
    });
  });

  describe("countUnreadUserMessagesForAdmin", () => {
    it("restricts to open conversations", async () => {
      runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ c: "3" }] });
      const port = createPgSupportCommunicationPort();
      const n = await port.countUnreadUserMessagesForAdmin({ organizationId: ORG_ID });
      expect(n).toBe(3);
      const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
      expect(sql).toContain("c.status <> 'closed'");
      expect(sql).toContain("c.closed_at IS NULL");
    });
  });

  describe("conversationExists", () => {
    it("returns false when SELECT 1 has no rows", async () => {
      runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
      const port = createPgSupportCommunicationPort();
      await expect(
        port.conversationExists("00000000-0000-4000-8000-000000000099"),
      ).resolves.toBe(false);
    });
  });

  describe("webapp support chat principal stamping", () => {
    it("preserves the legacy global key when no organization principal exists", async () => {
      const patientUserId = "00000000-0000-4000-8000-000000000111";
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "conv-global" }] });

      const port = createPgSupportCommunicationPort();
      await expect(port.ensureWebappConversationForUser(patientUserId)).resolves.toEqual({
        id: "conv-global",
        organizationId: null,
      });

      expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
        null,
        patientUserId,
        `webapp:platform:${patientUserId}`,
      ]);
      expect(runWebappPgTextMock.mock.calls[1]?.[1]).toEqual([
        null,
        `webapp:platform:${patientUserId}`,
        patientUserId,
      ]);
    });

    it("stamps ensured webapp conversations from current organization principal", async () => {
      const orgId = "10000000-0000-4000-8000-000000000001";
      const patientUserId = "00000000-0000-4000-8000-000000000111";
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "conv-webapp-1" }] });

      const port = createPgSupportCommunicationPort();
      const result = await runWithDbOrganizationPrincipal(orgId, () =>
        port.ensureWebappConversationForUser(patientUserId),
      );

      expect(result).toEqual({ id: "conv-webapp-1", organizationId: orgId });
      expect(runDrizzleMutationTransactionMock).toHaveBeenCalledTimes(1);
      const lookupSql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
      expect(lookupSql).toContain("organization_id = $1::uuid");
      expect(lookupSql).toContain("platform_user_id = $2::uuid");
      expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual([
        orgId,
        patientUserId,
        `webapp:organization:${orgId}:platform:${patientUserId}`,
      ]);
      const insertSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
      expect(insertSql).toContain("organization_id");
      expect(runWebappPgTextMock.mock.calls[1]?.[1]?.[0]).toBe(orgId);
      expect(runWebappPgTextMock.mock.calls[1]?.[1]?.[1]).toBe(
        `webapp:organization:${orgId}:platform:${patientUserId}`,
      );
    });

    it("creates separate organization-scoped threads for a patient enrolled in Clinic A and Clinic B", async () => {
      const clinicA = "10000000-0000-4000-8000-000000000001";
      const clinicB = "20000000-0000-4000-8000-000000000002";
      const patientUserId = "00000000-0000-4000-8000-000000000111";
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "conv-clinic-a" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: "conv-clinic-b" }] });

      const port = createPgSupportCommunicationPort();
      await expect(
        runWithDbOrganizationPrincipal(clinicA, () =>
          port.ensureWebappConversationForUser(patientUserId),
        ),
      ).resolves.toEqual({ id: "conv-clinic-a", organizationId: clinicA });
      await expect(
        runWithDbOrganizationPrincipal(clinicB, () =>
          port.ensureWebappConversationForUser(patientUserId),
        ),
      ).resolves.toEqual({ id: "conv-clinic-b", organizationId: clinicB });

      const clinicALookup = runWebappPgTextMock.mock.calls[0]?.[1];
      const clinicAInsert = runWebappPgTextMock.mock.calls[1]?.[1];
      const clinicBLookup = runWebappPgTextMock.mock.calls[2]?.[1];
      const clinicBInsert = runWebappPgTextMock.mock.calls[3]?.[1];
      expect(clinicALookup).toEqual([
        clinicA,
        patientUserId,
        `webapp:organization:${clinicA}:platform:${patientUserId}`,
      ]);
      expect(clinicBLookup).toEqual([
        clinicB,
        patientUserId,
        `webapp:organization:${clinicB}:platform:${patientUserId}`,
      ]);
      expect(clinicAInsert?.[1]).not.toBe(clinicBInsert?.[1]);
      expect(clinicAInsert?.[0]).toBe(clinicA);
      expect(clinicBInsert?.[0]).toBe(clinicB);
    });

    it("reuses a legacy webapp thread only when it is visible in the current organization", async () => {
      const orgId = "10000000-0000-4000-8000-000000000001";
      const patientUserId = "00000000-0000-4000-8000-000000000111";
      runWebappPgTextMock.mockResolvedValueOnce({
        rows: [{ id: "legacy-current-org", organization_id: orgId }],
      });

      const port = createPgSupportCommunicationPort();
      await expect(
        runWithDbOrganizationPrincipal(orgId, () =>
          port.ensureWebappConversationForUser(patientUserId),
        ),
      ).resolves.toEqual({ id: "legacy-current-org", organizationId: orgId });

      expect(runWebappPgTextMock).toHaveBeenCalledTimes(1);
      expect(String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "")).toContain(
        "WHERE organization_id = $1::uuid",
      );
    });

    it("rejects ensured webapp conversation when existing organization differs from principal", async () => {
      runWebappPgTextMock.mockResolvedValueOnce({
        rows: [{ id: "conv-webapp-1", organization_id: "20000000-0000-4000-8000-000000000002" }],
      });

      const port = createPgSupportCommunicationPort();
      await expect(
        runWithDbOrganizationPrincipal("10000000-0000-4000-8000-000000000001", () =>
          port.ensureWebappConversationForUser("00000000-0000-4000-8000-000000000111"),
        ),
      ).rejects.toThrow("organization_principal_mismatch");
    });

    it("stamps appended webapp messages from parent conversation organization", async () => {
      const orgId = "10000000-0000-4000-8000-000000000001";
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [{ organization_id: orgId }] })
        .mockResolvedValueOnce({ rows: [{ id: "msg-1" }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const port = createPgSupportCommunicationPort();
      const result = await runWithDbOrganizationPrincipal(orgId, () =>
        port.appendWebappMessage({
          conversationId: "00000000-0000-4000-8000-000000000222",
          integratorMessageId: "webapp-msg:test-1",
          senderRole: "admin",
          text: "hello",
          source: "webapp",
          createdAt: TS,
        }),
      );

      expect(result).toEqual({ id: "msg-1", created: true });
      const insertSql = String(runWebappPgTextMock.mock.calls[1]?.[0] ?? "");
      expect(insertSql).toContain("organization_id");
      expect(runWebappPgTextMock.mock.calls[1]?.[1]?.[0]).toBe(orgId);
      expect(runWebappPgTextMock.mock.calls[2]?.[1]?.[2]).toBe(orgId);
    });

    it("uses the bounded current-patient capability after inserting an own message", async () => {
      const orgId = "10000000-0000-4000-8000-000000000001";
      const patientUserId = "00000000-0000-4000-8000-000000000111";
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [{ organization_id: orgId }] })
        .mockResolvedValueOnce({ rows: [{ id: "00000000-0000-4000-8000-000000000333" }] })
        .mockResolvedValueOnce({ rows: [{ touched: true }] });

      const port = createPgSupportCommunicationPort();
      await expect(
        runWithDbPatientPrincipal({ organizationId: orgId, platformUserId: patientUserId }, () =>
          port.appendWebappMessage({
            conversationId: "00000000-0000-4000-8000-000000000222",
            integratorMessageId: "webapp-msg:patient-1",
            senderRole: "user",
            text: "hello",
            source: "webapp",
            createdAt: TS,
          }),
        ),
      ).resolves.toEqual({
        id: "00000000-0000-4000-8000-000000000333",
        created: true,
      });

      const activitySql = String(runWebappPgTextMock.mock.calls[2]?.[0] ?? "");
      expect(activitySql).toContain("app.touch_current_patient_support_conversation_activity");
      expect(activitySql).not.toContain("UPDATE support_conversations");
      expect(runWebappPgTextMock.mock.calls[2]?.[1]).toEqual([
        "00000000-0000-4000-8000-000000000333",
      ]);
    });

    it("rejects the patient message transaction when the bounded activity capability refuses it", async () => {
      const orgId = "10000000-0000-4000-8000-000000000001";
      const patientUserId = "00000000-0000-4000-8000-000000000111";
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [{ organization_id: orgId }] })
        .mockResolvedValueOnce({ rows: [{ id: "00000000-0000-4000-8000-000000000333" }] })
        .mockResolvedValueOnce({ rows: [{ touched: false }] });

      const port = createPgSupportCommunicationPort();
      await expect(
        runWithDbPatientPrincipal({ organizationId: orgId, platformUserId: patientUserId }, () =>
          port.appendWebappMessage({
            conversationId: "00000000-0000-4000-8000-000000000222",
            integratorMessageId: "webapp-msg:patient-2",
            senderRole: "user",
            text: "hello",
            source: "webapp",
            createdAt: TS,
          }),
        ),
      ).rejects.toThrow("patient_support_conversation_activity_rejected");
    });

    it("marks only messages already stamped with the trusted conversation organization", async () => {
      const orgId = "10000000-0000-4000-8000-000000000001";
      runWebappPgTextMock
        .mockResolvedValueOnce({ rows: [{ organization_id: orgId }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 2 });

      const port = createPgSupportCommunicationPort();
      await runWithDbOrganizationPrincipal(orgId, () =>
        port.markUserMessagesReadByAdmin("00000000-0000-4000-8000-000000000222"),
      );

      const markSql = String(runWebappPgTextMock.mock.calls[2]?.[0] ?? "");
      expect(markSql).toContain("organization_id = $2::uuid");
      expect(runWebappPgTextMock.mock.calls[2]?.[1]).toEqual([
        "00000000-0000-4000-8000-000000000222",
        orgId,
      ]);
    });
  });

  describe("mergeLegacySupportConversationsForPlatformUser", () => {
    it("does not merge another tenant's thread while an organization principal is active", async () => {
      const port = createPgSupportCommunicationPort();

      await expect(
        runWithDbOrganizationPrincipal("10000000-0000-4000-8000-000000000001", () =>
          port.mergeLegacySupportConversationsForPlatformUser!(
            "00000000-0000-4000-8000-000000000111",
          ),
        ),
      ).resolves.toEqual({ mergedConversationCount: 0, movedMessageCount: 0 });

      expect(getPoolMock).not.toHaveBeenCalled();
      expect(runMergeLegacySupportConversationsMock).not.toHaveBeenCalled();
    });

    it("runs legacy merge in a shared transaction helper", async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      };
      const pool = {
        connect: vi.fn().mockResolvedValue(client),
      };
      getPoolMock.mockReturnValue(pool);
      runMergeLegacySupportConversationsMock.mockResolvedValue({
        mergedConversationCount: 1,
        movedMessageCount: 2,
      });

      const port = createPgSupportCommunicationPort();
      expect(port.mergeLegacySupportConversationsForPlatformUser).toBeDefined();
      const result = await port.mergeLegacySupportConversationsForPlatformUser!(
        "00000000-0000-4000-8000-000000000001",
      );

      expect(result).toEqual({
        mergedConversationCount: 1,
        movedMessageCount: 2,
      });
      expect(pool.connect).toHaveBeenCalledTimes(1);
      expect(client.query).toHaveBeenCalledWith("BEGIN");
      expect(client.query).toHaveBeenCalledWith("COMMIT");
      expect(client.query).not.toHaveBeenCalledWith("ROLLBACK");
      expect(client.release).toHaveBeenCalledTimes(1);
      expect(runMergeLegacySupportConversationsMock).toHaveBeenCalledWith(
        client,
        "00000000-0000-4000-8000-000000000001",
      );
    });

    it("rolls back when legacy merge fails", async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      };
      const pool = {
        connect: vi.fn().mockResolvedValue(client),
      };
      getPoolMock.mockReturnValue(pool);
      runMergeLegacySupportConversationsMock.mockRejectedValue(new Error("merge failed"));

      const port = createPgSupportCommunicationPort();
      expect(port.mergeLegacySupportConversationsForPlatformUser).toBeDefined();
      await expect(
        port.mergeLegacySupportConversationsForPlatformUser!(
          "00000000-0000-4000-8000-000000000001",
        ),
      ).rejects.toThrow("merge failed");

      expect(client.query).toHaveBeenCalledWith("BEGIN");
      expect(client.query).toHaveBeenCalledWith("ROLLBACK");
      expect(client.query).not.toHaveBeenCalledWith("COMMIT");
      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });
});
