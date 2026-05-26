import { describe, expect, it } from "vitest";
import { extractBroadcastBodyContent } from "./extractBroadcastBodyContent";

describe("extractBroadcastBodyContent", () => {
  it("returns body after title prefix when stored combined", () => {
    expect(extractBroadcastBodyContent("Заголовок", "Заголовок\n\nТекст рассылки")).toBe("Текст рассылки");
  });

  it("returns full stored text when prefix does not match", () => {
    expect(extractBroadcastBodyContent("A", "Legacy body only")).toBe("Legacy body only");
  });
});
