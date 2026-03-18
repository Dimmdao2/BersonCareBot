import { describe, expect, it } from "vitest";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { handleIntegratorEvent, type IntegratorEventsDeps } from "./events";

const mockDeps: IntegratorEventsDeps = {
  diaries: {
    createSymptomTracking: async () => ({}),
    createLfkComplex: async () => ({}),
    addLfkSession: async () => ({}),
    addSymptomEntry: async () => ({}),
  },
};

describe("handleIntegratorEvent", () => {
  it("accepts diary.symptom.tracking.created with valid payload", async () => {
    const deps = buildAppDeps();
    const result = await handleIntegratorEvent(
      {
        eventType: "diary.symptom.tracking.created",
        payload: { userId: "usr-1", symptomTitle: "Головная боль" },
      },
      { diaries: deps.diaries }
    );
    expect(result.accepted).toBe(true);
  });

  it("rejects diary.symptom.tracking.created without userId", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "diary.symptom.tracking.created",
        payload: { symptomTitle: "X" },
      },
      mockDeps
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("userId");
  });

  it("rejects diary.symptom.tracking.created without symptomTitle", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "diary.symptom.tracking.created",
        payload: { userId: "usr-1" },
      },
      mockDeps
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("symptomTitle");
  });

  it("accepts diary.symptom.entry.created with valid payload after creating tracking", async () => {
    const deps = buildAppDeps();
    const trackingResult = await handleIntegratorEvent(
      {
        eventType: "diary.symptom.tracking.created",
        payload: { userId: "usr-entry-1", symptomTitle: "Спина" },
      },
      { diaries: deps.diaries }
    );
    expect(trackingResult.accepted).toBe(true);

    const trackings = await deps.diaries.listSymptomTrackings("usr-entry-1");
    expect(trackings.length).toBeGreaterThanOrEqual(1);
    const trackingId = trackings[0].id;

    const result = await handleIntegratorEvent(
      {
        eventType: "diary.symptom.entry.created",
        payload: {
          userId: "usr-entry-1",
          trackingId,
          value0_10: 7,
          entryType: "instant",
          recordedAt: new Date().toISOString(),
        },
      },
      { diaries: deps.diaries }
    );
    expect(result.accepted).toBe(true);

    const entries = await deps.diaries.listSymptomEntries("usr-entry-1");
    expect(entries.some((e) => e.value0_10 === 7 && e.trackingId === trackingId)).toBe(true);
  });

  it("rejects diary.symptom.entry.created without trackingId", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "diary.symptom.entry.created",
        payload: { userId: "u", value0_10: 5, entryType: "instant", recordedAt: new Date().toISOString() },
      },
      mockDeps
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("trackingId");
  });

  it("rejects diary.symptom.entry.created with value0_10 out of range", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "diary.symptom.entry.created",
        payload: {
          userId: "u",
          trackingId: "tr-any",
          value0_10: 11,
          entryType: "instant",
          recordedAt: new Date().toISOString(),
        },
      },
      mockDeps
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("value0_10");
  });

  it("accepts diary.lfk.complex.created with valid payload", async () => {
    const deps = buildAppDeps();
    const result = await handleIntegratorEvent(
      {
        eventType: "diary.lfk.complex.created",
        payload: { userId: "usr-lfk-1", title: "Разминка для шеи" },
      },
      { diaries: deps.diaries }
    );
    expect(result.accepted).toBe(true);
  });

  it("accepts diary.lfk.session.created after creating complex", async () => {
    const deps = buildAppDeps();
    const complexResult = await handleIntegratorEvent(
      {
        eventType: "diary.lfk.complex.created",
        payload: { userId: "usr-lfk-2", title: "Спина" },
      },
      { diaries: deps.diaries }
    );
    expect(complexResult.accepted).toBe(true);
    const complexes = await deps.diaries.listLfkComplexes("usr-lfk-2");
    expect(complexes.length).toBeGreaterThanOrEqual(1);
    const complexId = complexes[0].id;
    const result = await handleIntegratorEvent(
      {
        eventType: "diary.lfk.session.created",
        payload: {
          userId: "usr-lfk-2",
          complexId,
          completedAt: new Date().toISOString(),
        },
      },
      { diaries: deps.diaries }
    );
    expect(result.accepted).toBe(true);
  });

  it("returns not implemented for unknown event type", async () => {
    const result = await handleIntegratorEvent(
      {
        eventType: "unknown.event",
      },
      mockDeps
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain("not implemented");
  });
});
