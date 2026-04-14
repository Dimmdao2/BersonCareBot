import { describe, expect, it } from "vitest";
import {
  classifyAuthEntryFlowFromSearchParams,
  shouldSuppressQueryJwtForMaxCtx,
} from "./authEntryFlow";

describe("authEntryFlow", () => {
  it("suppresses query jwt when ctx=max", () => {
    const sp = new URLSearchParams("ctx=max&t=abc");
    expect(shouldSuppressQueryJwtForMaxCtx(sp)).toBe(true);
  });

  it("classifies max when ctx=max", () => {
    const sp = new URLSearchParams("ctx=max");
    expect(classifyAuthEntryFlowFromSearchParams(sp)).toBe("max");
  });

  it("classifies telegram when ctx=bot", () => {
    const sp = new URLSearchParams("ctx=bot");
    expect(classifyAuthEntryFlowFromSearchParams(sp)).toBe("telegram");
  });

  it("classifies browser otherwise", () => {
    expect(classifyAuthEntryFlowFromSearchParams(new URLSearchParams(""))).toBe("browser");
  });
});
