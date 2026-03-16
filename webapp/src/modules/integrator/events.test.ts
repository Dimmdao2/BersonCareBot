import { describe, expect, it } from "vitest";
import { handleIntegratorEvent } from "./events";

describe("handleIntegratorEvent", () => {
  it("accepts diary.symptom.tracking.created with valid payload", async () => {
    const result = await handleIntegratorEvent({
      eventType: "diary.symptom.tracking.created",
      payload: { userId: "usr-1", symptomTitle: "Головная боль" },
    });
    expect(result.accepted).toBe(true);
  });

  it("rejects diary.symptom.tracking.created without userId", async () => {
    const result = await handleIntegratorEvent({
      eventType: "diary.symptom.tracking.created",
      payload: { symptomTitle: "X" },
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("userId");
  });

  it("rejects diary.symptom.tracking.created without symptomTitle", async () => {
    const result = await handleIntegratorEvent({
      eventType: "diary.symptom.tracking.created",
      payload: { userId: "usr-1" },
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("symptomTitle");
  });

  it("accepts diary.symptom.entry.created with valid payload after creating tracking", async () => {
    const trackingResult = await handleIntegratorEvent({
      eventType: "diary.symptom.tracking.created",
      payload: { userId: "usr-entry-1", symptomTitle: "Спина" },
    });
    expect(trackingResult.accepted).toBe(true);

    const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
    const deps = buildAppDeps();
    const trackings = await deps.diaries.listSymptomTrackings("usr-entry-1");
    expect(trackings.length).toBeGreaterThanOrEqual(1);
    const trackingId = trackings[0].id;

    const result = await handleIntegratorEvent({
      eventType: "diary.symptom.entry.created",
      payload: {
        userId: "usr-entry-1",
        trackingId,
        value0_10: 7,
        entryType: "instant",
        recordedAt: new Date().toISOString(),
      },
    });
    expect(result.accepted).toBe(true);

    const entries = await deps.diaries.listSymptomEntries("usr-entry-1");
    expect(entries.some((e) => e.value0_10 === 7 && e.trackingId === trackingId)).toBe(true);
  });

  it("rejects diary.symptom.entry.created without trackingId", async () => {
    const result = await handleIntegratorEvent({
      eventType: "diary.symptom.entry.created",
      payload: { userId: "u", value0_10: 5, entryType: "instant", recordedAt: new Date().toISOString() },
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("trackingId");
  });

  it("rejects diary.symptom.entry.created with value0_10 out of range", async () => {
    const result = await handleIntegratorEvent({
      eventType: "diary.symptom.entry.created",
      payload: {
        userId: "u",
        trackingId: "tr-any",
        value0_10: 11,
        entryType: "instant",
        recordedAt: new Date().toISOString(),
      },
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("value0_10");
  });

  it("accepts diary.lfk.complex.created with valid payload", async () => {
    const result = await handleIntegratorEvent({
      eventType: "diary.lfk.complex.created",
      payload: { userId: "usr-lfk-1", title: "Разминка для шеи" },
    });
    expect(result.accepted).toBe(true);
  });

  it("accepts diary.lfk.session.created after creating complex", async () => {
    const complexResult = await handleIntegratorEvent({
      eventType: "diary.lfk.complex.created",
      payload: { userId: "usr-lfk-2", title: "Спина" },
    });
    expect(complexResult.accepted).toBe(true);
    const { buildAppDeps } = await import("@/app-layer/di/buildAppDeps");
    const deps = buildAppDeps();
    const complexes = await deps.diaries.listLfkComplexes("usr-lfk-2");
    expect(complexes.length).toBeGreaterThanOrEqual(1);
    const complexId = complexes[0].id;
    const result = await handleIntegratorEvent({
      eventType: "diary.lfk.session.created",
      payload: {
        userId: "usr-lfk-2",
        complexId,
        completedAt: new Date().toISOString(),
      },
    });
    expect(result.accepted).toBe(true);
  });

  it("returns not implemented for unknown event type", async () => {
    const result = await handleIntegratorEvent({
      eventType: "unknown.event",
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("not implemented");
  });
});
