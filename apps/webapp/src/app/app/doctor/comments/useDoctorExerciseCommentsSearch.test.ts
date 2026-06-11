import { describe, expect, it } from "vitest";
import { shouldRunDoctorCommentsServerSearch } from "./useDoctorExerciseCommentsSearch";

describe("shouldRunDoctorCommentsServerSearch", () => {
  it("returns false when query is empty", () => {
    expect(shouldRunDoctorCommentsServerSearch(0, "")).toBe(false);
    expect(shouldRunDoctorCommentsServerSearch(3, "  ")).toBe(false);
  });

  it("returns false when local matches exist", () => {
    expect(shouldRunDoctorCommentsServerSearch(1, "иванов")).toBe(false);
    expect(shouldRunDoctorCommentsServerSearch(5, "болит")).toBe(false);
  });

  it("returns true when query set and no local matches", () => {
    expect(shouldRunDoctorCommentsServerSearch(0, "иванов")).toBe(true);
    expect(shouldRunDoctorCommentsServerSearch(0, "тест")).toBe(true);
  });
});
