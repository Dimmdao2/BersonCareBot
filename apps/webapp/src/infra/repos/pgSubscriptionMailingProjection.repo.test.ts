import { beforeEach, describe, expect, it, vi } from "vitest";

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock("@/infra/db/runWebappSql", () => ({
  runWebappPgText: (...args: unknown[]) => runWebappPgTextMock(...args),
}));

import { createPgSubscriptionMailingProjectionPort } from "./pgSubscriptionMailingProjection";

describe("pgSubscriptionMailingProjection (repo SQL parity)", () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it("upsertTopicFromProjection uses ON CONFLICT integrator_topic_id", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const port = createPgSubscriptionMailingProjectionPort();
    await port.upsertTopicFromProjection({
      integratorTopicId: 100,
      code: "news",
      title: "News",
      key: "news",
      isActive: true,
      updatedAt: "2025-01-01T00:00:00.000Z",
    });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("mailing_topics_webapp");
    expect(sql).toContain("ON CONFLICT (integrator_topic_id)");
  });

  it("upsertUserSubscriptionFromProjection uses composite ON CONFLICT", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const port = createPgSubscriptionMailingProjectionPort();
    await port.upsertUserSubscriptionFromProjection({
      integratorUserId: 1,
      integratorTopicId: 100,
      isActive: true,
      updatedAt: "2025-01-01T00:00:00.000Z",
    });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("user_subscriptions_webapp");
    expect(sql).toContain("ON CONFLICT (integrator_user_id, integrator_topic_id)");
  });

  it("appendMailingLogFromProjection uses DO NOTHING on conflict", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const port = createPgSubscriptionMailingProjectionPort();
    await port.appendMailingLogFromProjection({
      integratorUserId: 1,
      integratorMailingId: 200,
      status: "sent",
      sentAt: "2025-01-01T12:00:00.000Z",
      errorText: null,
    });
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("mailing_logs_webapp");
    expect(sql).toContain("DO NOTHING");
  });

  it("listTopics selects active topics", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgSubscriptionMailingProjectionPort();
    await port.listTopics();
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("is_active = true");
  });

  it("listSubscriptionsByIntegratorUserId joins topics", async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });
    const port = createPgSubscriptionMailingProjectionPort();
    await port.listSubscriptionsByIntegratorUserId("42");
    const sql = String(runWebappPgTextMock.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("JOIN mailing_topics_webapp");
    expect(runWebappPgTextMock.mock.calls[0]?.[1]).toEqual(["42"]);
  });
});
