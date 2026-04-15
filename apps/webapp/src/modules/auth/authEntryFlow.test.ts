import { describe, expect, it } from "vitest";
import {
  classifyAuthEntryFlowFromSearchParams,
  shouldSuppressQueryJwtForMaxCtx,
  shouldSuppressQueryJwtForMessengerMiniApp,
} from "./authEntryFlow";

describe("authEntryFlow", () => {
  it("suppresses query jwt when ctx=max", () => {
    const sp = new URLSearchParams("ctx=max&t=abc");
    expect(shouldSuppressQueryJwtForMessengerMiniApp(sp)).toBe(true);
    expect(shouldSuppressQueryJwtForMaxCtx(sp)).toBe(true);
  });

  it("suppresses query jwt when ctx=bot (канон miniapp)", () => {
    const sp = new URLSearchParams("ctx=bot&t=abc");
    expect(shouldSuppressQueryJwtForMessengerMiniApp(sp)).toBe(true);
    expect(shouldSuppressQueryJwtForMaxCtx(sp)).toBe(true);
  });

  it("does not suppress query jwt without messenger ctx", () => {
    const sp = new URLSearchParams("t=abc");
    expect(shouldSuppressQueryJwtForMessengerMiniApp(sp)).toBe(false);
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

  it("standalone URL с ?t= остаётся browser и не подавляет JWT", () => {
    const sp = new URLSearchParams("t=signed-token");
    expect(classifyAuthEntryFlowFromSearchParams(sp)).toBe("browser");
    expect(shouldSuppressQueryJwtForMessengerMiniApp(sp)).toBe(false);
  });
});
