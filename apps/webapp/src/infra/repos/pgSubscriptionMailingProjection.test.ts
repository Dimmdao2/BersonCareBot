import { describe, expect, it } from "vitest";
import {
  inMemorySubscriptionMailingProjectionPort,
  _testGetTopicByIntegratorId,
  _testGetSubscription,
  _testGetMailingLog,
} from "./inMemorySubscriptionMailingProjection";

describe("SubscriptionMailingProjectionPort (in-memory contract)", () => {
  it("upsertTopicFromProjection is idempotent by integrator_topic_id", async () => {
    const port = inMemorySubscriptionMailingProjectionPort;
    await port.upsertTopicFromProjection({
      integratorTopicId: 100,
      code: "news",
      title: "News",
      key: "news",
      isActive: true,
      updatedAt: "2025-01-01T00:00:00.000Z",
    });
    await port.upsertTopicFromProjection({
      integratorTopicId: 100,
      code: "news",
      title: "News & Updates",
      key: "news",
      isActive: false,
      updatedAt: "2025-01-02T00:00:00.000Z",
    });
    const topic = _testGetTopicByIntegratorId(100);
    expect(topic).toBeDefined();
    expect(topic!.title).toBe("News & Updates");
    expect(topic!.isActive).toBe(false);
    expect(topic!.updatedAt).toBe("2025-01-02T00:00:00.000Z");
  });

  it("upsertUserSubscriptionFromProjection is idempotent by (integrator_user_id, integrator_topic_id)", async () => {
    const port = inMemorySubscriptionMailingProjectionPort;
    await port.upsertUserSubscriptionFromProjection({
      integratorUserId: 1,
      integratorTopicId: 100,
      isActive: true,
      updatedAt: "2025-01-01T00:00:00.000Z",
    });
    await port.upsertUserSubscriptionFromProjection({
      integratorUserId: 1,
      integratorTopicId: 100,
      isActive: false,
      updatedAt: "2025-01-02T00:00:00.000Z",
    });
    const sub = _testGetSubscription(1, 100);
    expect(sub).toBeDefined();
    expect(sub!.isActive).toBe(false);
    expect(sub!.updatedAt).toBe("2025-01-02T00:00:00.000Z");
  });

  it("appendMailingLogFromProjection does not duplicate by (integrator_user_id, integrator_mailing_id)", async () => {
    const port = inMemorySubscriptionMailingProjectionPort;
    await port.appendMailingLogFromProjection({
      integratorUserId: 1,
      integratorMailingId: 200,
      status: "sent",
      sentAt: "2025-01-01T12:00:00.000Z",
      errorText: null,
    });
    await port.appendMailingLogFromProjection({
      integratorUserId: 1,
      integratorMailingId: 200,
      status: "failed",
      sentAt: "2025-01-01T12:01:00.000Z",
      errorText: "retry",
    });
    const log = _testGetMailingLog(1, 200);
    expect(log).toBeDefined();
    expect(log!.status).toBe("sent");
    expect(log!.errorText).toBeNull();
  });
});
