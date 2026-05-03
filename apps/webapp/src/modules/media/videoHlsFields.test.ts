import { describe, expect, it } from "vitest";
import {
  parseAvailableQualitiesJson,
  parseVideoDeliveryOverride,
  parseVideoProcessingStatus,
} from "./videoHlsFields";

describe("videoHlsFields", () => {
  it("parseVideoProcessingStatus accepts canonical values", () => {
    expect(parseVideoProcessingStatus("ready")).toBe("ready");
    expect(parseVideoProcessingStatus(null)).toBeNull();
    expect(parseVideoProcessingStatus("bogus")).toBeNull();
  });

  it("parseVideoDeliveryOverride accepts canonical values", () => {
    expect(parseVideoDeliveryOverride("auto")).toBe("auto");
    expect(parseVideoDeliveryOverride(null)).toBeNull();
  });

  it("parseAvailableQualitiesJson parses array of objects", () => {
    expect(
      parseAvailableQualitiesJson([
        { renditionId: "720p", height: 720, bandwidth: 1_500_000 },
        { foo: "bar" },
      ]),
    ).toEqual([{ renditionId: "720p", height: 720, bandwidth: 1_500_000 }]);
    expect(parseAvailableQualitiesJson(null)).toBeNull();
    expect(parseAvailableQualitiesJson({})).toBeNull();
  });
});
