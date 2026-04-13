import { describe, expect, it } from "vitest";
import {
  effectiveAutoMergedDisplayName,
  effectiveAutoMergedFirstName,
  effectiveAutoMergedLastName,
  pickAutoMergeNamePrimarySide,
} from "@/infra/repos/autoMergeScalarEffective";

const base = {
  display_name: "",
  first_name: null as string | null,
  last_name: null as string | null,
};

describe("pickAutoMergeNamePrimarySide", () => {
  it("prefers the merge target row when it is the only one with a phone", () => {
    const pu = { ...base, phone_normalized: "+7900", created_at: new Date("2021-01-01") };
    const dup = { ...base, phone_normalized: null, created_at: new Date("2020-01-01") };
    expect(pickAutoMergeNamePrimarySide(pu, dup)).toBe("pu");
  });

  it("when only duplicate has phone, primary side is dup", () => {
    const pu = { ...base, phone_normalized: null, created_at: new Date("2020-01-01") };
    const dup = { ...base, phone_normalized: "+7900", created_at: new Date("2021-01-01") };
    expect(pickAutoMergeNamePrimarySide(pu, dup)).toBe("dup");
  });

  it("when both have phone, prefers older created_at", () => {
    const older = { ...base, phone_normalized: "+7900", created_at: new Date("2020-01-01") };
    const newer = { ...base, phone_normalized: "+7900", created_at: new Date("2021-06-01") };
    expect(pickAutoMergeNamePrimarySide(older, newer)).toBe("pu");
    expect(pickAutoMergeNamePrimarySide(newer, older)).toBe("dup");
  });
});

describe("effectiveAutoMergedFirstName", () => {
  it("same phone: older row wins over newer bot-style name", () => {
    const crm = {
      ...base,
      phone_normalized: "+7900",
      created_at: new Date("2020-01-01"),
      first_name: "Иван",
      last_name: "Петров",
      display_name: "Иван Петров",
    };
    const bot = {
      ...base,
      phone_normalized: "+7900",
      created_at: new Date("2021-06-01"),
      first_name: "Vasya",
      last_name: "Bot",
      display_name: "Vasya",
    };
    expect(effectiveAutoMergedFirstName(crm, bot)).toBe("Иван");
    expect(effectiveAutoMergedLastName(crm, bot)).toBe("Петров");
    expect(effectiveAutoMergedDisplayName(crm, bot)).toBe("Иван Петров");
  });

  it("same phone, reversed arg order: still older wins", () => {
    const crm = {
      ...base,
      phone_normalized: "+7900",
      created_at: new Date("2020-01-01"),
      first_name: "Иван",
      last_name: null,
      display_name: "",
    };
    const bot = {
      ...base,
      phone_normalized: "+7900",
      created_at: new Date("2021-06-01"),
      first_name: "Wrong",
      last_name: "Name",
      display_name: "Wrong Name",
    };
    expect(effectiveAutoMergedFirstName(bot, crm)).toBe("Иван");
    expect(effectiveAutoMergedLastName(bot, crm)).toBe("Name");
  });
});
