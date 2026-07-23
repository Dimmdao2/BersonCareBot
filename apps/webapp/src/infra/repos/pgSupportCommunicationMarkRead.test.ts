import { describe, expect, it } from "vitest";
import { inMemorySupportCommunicationPort } from "./inMemorySupportCommunication";

// Contract for the patient support "mark inbound read" path.
//
// Defect fixed alongside this test: markInboundReadForUser (and the sibling
// markInboundMessagesReadForUser / markNotificationMessagesReadForUser) in
// pgSupportCommunication.ts issue `UPDATE support_conversation_messages SET read_at ...` under the
// app_patient DB role, but p0-5b-grants.sql granted app_patient only SELECT, INSERT on that table ->
// SQLSTATE 42501 -> HTTP 500. The fix is the narrowed column grant added in
// deploy/postgres/patient-support-mark-read-grant.sql (GRANT UPDATE (read_at) ... TO app_patient),
// mirroring the send-path's whole-table/column grant pattern (no SECURITY DEFINER wrapper).
//
// The two behavioural guarantees below (owner succeeds, cross-user denied) run against the in-memory
// port -- the same harness every other support-messages contract test in this repo uses. They pin the
// authorization *semantics* the DB grant + RLS must reproduce. They do NOT exercise the real GRANT /
// RLS aclcheck, because there is no pg-backed test harness in this package. See the skipped
// "live pg harness" block for exactly what must be verified on TEST to prove the 42501 fix.

describe("markInboundReadForUser authorization contract (in-memory)", () => {
  it("owner can mark their inbound support messages read", async () => {
    const port = inMemorySupportCommunicationPort;
    const platformUserId = "00000000-0000-4000-8000-0000000markrd1";
    const { id: convId } = await port.ensureWebappConversationForUser(platformUserId);
    const now = new Date().toISOString();
    await port.appendWebappMessage({
      conversationId: convId,
      integratorMessageId: "markread-owner-a",
      senderRole: "admin",
      text: "Reply one",
      source: "webapp",
      createdAt: now,
    });
    await port.appendWebappMessage({
      conversationId: convId,
      integratorMessageId: "markread-owner-b",
      senderRole: "admin",
      text: "Reply two",
      source: "webapp",
      createdAt: now,
    });

    expect(await port.countUnreadForUser(platformUserId)).toBe(2);
    await port.markInboundReadForUser(convId, platformUserId);
    expect(await port.countUnreadForUser(platformUserId)).toBe(0);
  });

  it("does not mark read when a different (non-owner) user targets the conversation", async () => {
    const port = inMemorySupportCommunicationPort;
    const ownerUserId = "00000000-0000-4000-8000-0000000markrd2";
    const otherUserId = "00000000-0000-4000-8000-0000000markrd3";
    const { id: ownerConvId } = await port.ensureWebappConversationForUser(ownerUserId);
    // Give the other user their own (separate) conversation so both are valid patients.
    await port.ensureWebappConversationForUser(otherUserId);
    const now = new Date().toISOString();
    await port.appendWebappMessage({
      conversationId: ownerConvId,
      integratorMessageId: "markread-crossuser-a",
      senderRole: "admin",
      text: "Owner-only reply",
      source: "webapp",
      createdAt: now,
    });

    expect(await port.countUnreadForUser(ownerUserId)).toBe(1);
    // A non-owner passing the owner's conversation id must be a no-op (owner-scope check).
    await port.markInboundReadForUser(ownerConvId, otherUserId);
    expect(await port.countUnreadForUser(ownerUserId)).toBe(1);

    // The rightful owner can still clear it.
    await port.markInboundReadForUser(ownerConvId, ownerUserId);
    expect(await port.countUnreadForUser(ownerUserId)).toBe(0);
  });
});

// Live pg-backed verification (REQUIRES a real Postgres + the app_patient role; not runnable here --
// this package has no pg test harness and this environment has no database). Skipped as executable
// documentation of the exact contract to run on TEST after applying
// deploy/postgres/patient-support-mark-read-grant.sql. Turning this into a live test needs a pg
// harness that connects AS app_patient with app.current_patient_user_id() set via the runtime helper.
describe.skip("markInboundReadForUser DB grant + RLS contract (live pg harness required)", () => {
  it("app_patient can UPDATE read_at on its own conversation's inbound messages (no 42501)", () => {
    // On TEST, connected AS app_patient with app.current_patient_user_id() = <owner>:
    //   UPDATE support_conversation_messages m
    //      SET read_at = COALESCE(m.read_at, now())
    //    WHERE conversation_id IN (
    //            SELECT id FROM support_conversations WHERE platform_user_id = <owner>)
    //      AND m.sender_role <> 'user' AND m.read_at IS NULL;
    // Expected: succeeds and updates the owner's rows. BEFORE the grant it fails with SQLSTATE 42501
    // (permission denied for table support_conversation_messages).
    expect(true).toBe(true);
  });

  it("app_patient cannot mark-read another patient's conversation (RLS saas_org_dormant_p0_8_4)", () => {
    // Connected AS app_patient with app.current_patient_user_id() = <other-user>, the same UPDATE
    // targeting <owner>'s conversation must affect 0 rows: the RLS USING/WITH CHECK clause requires
    // EXISTS(support_conversations WHERE id = conversation_id AND platform_user_id =
    // app.current_patient_user_id()). Column grant never widens the row set.
    expect(true).toBe(true);
  });
});
