import { describe, expect, it, beforeEach } from "vitest";
import { createRecommendationsService } from "./service";
import {
  inMemoryRecommendationsPort,
  resetInMemoryRecommendationsStore,
} from "@/app-layer/testing/clinicalLibraryInMemory";

describe("recommendations service", () => {
  beforeEach(() => {
    resetInMemoryRecommendationsStore();
  });

  it("createRecommendation rejects empty title", async () => {
    const svc = createRecommendationsService(inMemoryRecommendationsPort);
    await expect(svc.createRecommendation({ title: "  ", bodyMd: "x" }, null)).rejects.toThrow(/обязательно/);
  });

  it("listRecommendations hides archived", async () => {
    await inMemoryRecommendationsPort.create({ title: "Visible", bodyMd: "a" }, null);
    const hid = await inMemoryRecommendationsPort.create({ title: "Hidden", bodyMd: "b" }, null);
    await inMemoryRecommendationsPort.archive(hid.id);

    const svc = createRecommendationsService(inMemoryRecommendationsPort);
    const listed = await svc.listRecommendations({});
    expect(listed.some((r) => r.id === hid.id)).toBe(false);
  });
});
