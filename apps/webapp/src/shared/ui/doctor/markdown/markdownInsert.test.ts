import { describe, expect, it } from "vitest";
import { insertLinePrefix, insertSnippet, wrapSelection } from "./markdownInsert";

describe("markdownInsert", () => {
  it("wrapSelection wraps selection with bold", () => {
    const r = wrapSelection("hello world", 6, 11, "**");
    expect(r.next).toBe("hello **world**");
    expect(r.caret).toBe(r.next.length);
  });

  it("wrapSelection uses placeholder when selection empty", () => {
    const r = wrapSelection("ab", 1, 1, "**");
    expect(r.next).toBe("a**текст**b");
  });

  it("insertLinePrefix adds list marker at line start", () => {
    const r = insertLinePrefix("line1\nline2", 7, "- ");
    expect(r.next).toBe("line1\n- line2");
  });

  it("insertSnippet replaces selection", () => {
    const r = insertSnippet("x", 0, 1, "[a](u)");
    expect(r.next).toBe("[a](u)");
    expect(r.caret).toBe("[a](u)".length);
  });
});
