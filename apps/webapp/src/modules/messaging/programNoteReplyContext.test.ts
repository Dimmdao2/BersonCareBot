import { describe, expect, it } from "vitest";
import {
  buildProgramNoteReplyState,
  formatPatientExerciseCommentReplyText,
} from "./programNoteReplyContext";

describe("programNoteReplyContext", () => {
  it("buildProgramNoteReplyState encodes stage item in admin_reply state", () => {
    const state = buildProgramNoteReplyState("webapp:platform:abc", "item-1");
    expect(state).toBe("admin_reply:webapp:platform:abc#pn:item-1");
  });

  it("formatPatientExerciseCommentReplyText prefixes doctor reply", () => {
    const text = formatPatientExerciseCommentReplyText({
      exerciseTitle: "Присед",
      doctorText: "Делайте медленнее",
    });
    expect(text).toBe(
      "Ответ на ваш комментарий к упражнению «Присед»:\n\nДелайте медленнее",
    );
  });

  it("formatPatientExerciseCommentReplyText uses default title when empty", () => {
    const text = formatPatientExerciseCommentReplyText({
      exerciseTitle: "  ",
      doctorText: "Ок",
    });
    expect(text).toContain("«Пункт программы»");
  });
});
