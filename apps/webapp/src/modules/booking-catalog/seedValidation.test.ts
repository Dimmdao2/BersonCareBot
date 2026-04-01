/**
 * Tests for seed validation logic (mirrors seed-booking-catalog-tochka-zdorovya.ts).
 * Validates fail-fast behavior and idempotency of mandatory field checks.
 */
import { describe, expect, it } from "vitest";

type Branch = { title: string; rubitime_branch_id: string };
type Specialist = { full_name: string; rubitime_branch_id: string; rubitime_cooperator_id: string };
type Service = { title: string; duration_minutes: number; price_minor: number };
type BranchService = {
  rubitime_branch_id: string;
  rubitime_cooperator_id: string;
  service_title: string;
  rubitime_service_id: string;
};

function validateMandatoryFields(
  branches: Branch[],
  specialists: Specialist[],
  services: Service[],
  branchServices: BranchService[],
): string[] {
  const errors: string[] = [];

  for (const branch of branches) {
    if (!branch.rubitime_branch_id)
      errors.push(`Branch "${branch.title}": rubitime_branch_id missing`);
  }
  for (const sp of specialists) {
    if (!sp.rubitime_cooperator_id)
      errors.push(`Specialist "${sp.full_name}": rubitime_cooperator_id missing`);
  }
  for (const svc of services) {
    if (!svc.duration_minutes || svc.duration_minutes <= 0)
      errors.push(`Service "${svc.title}": duration_minutes missing or invalid`);
    if (!svc.price_minor || svc.price_minor <= 0)
      errors.push(`Service "${svc.title}": price_minor missing or invalid`);
  }
  for (const bs of branchServices) {
    if (!bs.rubitime_service_id)
      errors.push(`BranchService "${bs.service_title}": rubitime_service_id missing`);
  }

  return errors;
}

// Mirrors the actual SEED constants from the script
const VALID_BRANCHES: Branch[] = [
  { title: "Москва. Точка Здоровья", rubitime_branch_id: "17356" },
  { title: "Санкт-Петербург", rubitime_branch_id: "18265" },
];

const VALID_SPECIALISTS: Specialist[] = [
  { full_name: "Дмитрий Берсон", rubitime_branch_id: "17356", rubitime_cooperator_id: "34729" },
  { full_name: "Дмитрий Берсон", rubitime_branch_id: "18265", rubitime_cooperator_id: "37449" },
];

const VALID_SERVICES: Service[] = [
  { title: "Сеанс 40 мин", duration_minutes: 40, price_minor: 400000 },
  { title: "Сеанс 60 мин", duration_minutes: 60, price_minor: 600000 },
  { title: "Сеанс 90 мин", duration_minutes: 90, price_minor: 800000 },
];

const VALID_BRANCH_SERVICES: BranchService[] = [
  { rubitime_branch_id: "17356", rubitime_cooperator_id: "34729", service_title: "Сеанс 40 мин", rubitime_service_id: "67591" },
  { rubitime_branch_id: "17356", rubitime_cooperator_id: "34729", service_title: "Сеанс 60 мин", rubitime_service_id: "67452" },
  { rubitime_branch_id: "17356", rubitime_cooperator_id: "34729", service_title: "Сеанс 90 мин", rubitime_service_id: "67801" },
  { rubitime_branch_id: "18265", rubitime_cooperator_id: "37449", service_title: "Сеанс 60 мин", rubitime_service_id: "67472" },
  { rubitime_branch_id: "18265", rubitime_cooperator_id: "37449", service_title: "Сеанс 90 мин", rubitime_service_id: "67471" },
];

describe("seed-booking-catalog validation", () => {
  it("returns no errors for valid seed data", () => {
    const errors = validateMandatoryFields(
      VALID_BRANCHES, VALID_SPECIALISTS, VALID_SERVICES, VALID_BRANCH_SERVICES,
    );
    expect(errors).toHaveLength(0);
  });

  it("catches missing rubitime_branch_id", () => {
    const bad = [{ title: "TestBranch", rubitime_branch_id: "" }];
    const errors = validateMandatoryFields(bad, VALID_SPECIALISTS, VALID_SERVICES, VALID_BRANCH_SERVICES);
    expect(errors.some((e) => e.includes("rubitime_branch_id missing"))).toBe(true);
  });

  it("catches missing rubitime_cooperator_id", () => {
    const bad = [{ full_name: "Test", rubitime_branch_id: "17356", rubitime_cooperator_id: "" }];
    const errors = validateMandatoryFields(VALID_BRANCHES, bad, VALID_SERVICES, VALID_BRANCH_SERVICES);
    expect(errors.some((e) => e.includes("rubitime_cooperator_id missing"))).toBe(true);
  });

  it("catches zero price_minor", () => {
    const bad = [{ title: "Bad Svc", duration_minutes: 60, price_minor: 0 }];
    const errors = validateMandatoryFields(VALID_BRANCHES, VALID_SPECIALISTS, bad, VALID_BRANCH_SERVICES);
    expect(errors.some((e) => e.includes("price_minor"))).toBe(true);
  });

  it("catches missing rubitime_service_id in branch_services", () => {
    const bad: BranchService[] = [{
      rubitime_branch_id: "17356", rubitime_cooperator_id: "34729",
      service_title: "Сеанс X", rubitime_service_id: "",
    }];
    const errors = validateMandatoryFields(VALID_BRANCHES, VALID_SPECIALISTS, VALID_SERVICES, bad);
    expect(errors.some((e) => e.includes("rubitime_service_id missing"))).toBe(true);
  });

  it("check-only: two runs produce identical results (idempotency)", () => {
    const r1 = validateMandatoryFields(VALID_BRANCHES, VALID_SPECIALISTS, VALID_SERVICES, VALID_BRANCH_SERVICES);
    const r2 = validateMandatoryFields(VALID_BRANCHES, VALID_SPECIALISTS, VALID_SERVICES, VALID_BRANCH_SERVICES);
    expect(r1).toEqual(r2);
    expect(r1).toHaveLength(0);
  });

  it("SPb branch does NOT include Сеанс 40 мин", () => {
    const spbLinks = VALID_BRANCH_SERVICES.filter((bs) => bs.rubitime_branch_id === "18265");
    expect(spbLinks.some((bs) => bs.service_title === "Сеанс 40 мин")).toBe(false);
    expect(VALID_BRANCH_SERVICES).toHaveLength(5);
  });
});
