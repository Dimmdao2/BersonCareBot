import { describe, expect, it } from "vitest";
import { parseBookingAttributionFromSearchParams } from "./parseBookingAttribution";

describe("parseBookingAttributionFromSearchParams", () => {
  it("maps UTM and city preset", () => {
    const params = new URLSearchParams(
      "utm_source=tilda&utm_medium=banner&city=moscow&embed=iframe",
    );
    expect(parseBookingAttributionFromSearchParams(params)).toMatchObject({
      utmSource: "tilda",
      utmMedium: "banner",
      presetCityCode: "moscow",
      embedMode: "iframe",
    });
  });
});
