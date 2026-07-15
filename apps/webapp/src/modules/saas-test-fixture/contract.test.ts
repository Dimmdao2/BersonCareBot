import { describe, expect, it } from "vitest";
import {
  parseSaasTestFixturePacket,
  validateSaasTestFixturePacketMetadata,
} from "../../../../../deploy/host/saas-test-fixture-packet.mjs";
import {
  buildSaasTestFixturePlan,
  readSaasTestFixtureConfig,
  resolveFixtureAppointmentTimes,
  runSaasTestFixtureCli,
  SAAS_TEST_FIXTURE_IDS,
} from "../../../scripts/seed-saas-test-walkthrough-fixtures";

const packetValues = {
  SAAS_TEST_FIXTURE_ENABLED: "1",
  SAAS_TEST_FIXTURE_CLINIC_A_EMAIL: "clinic-a@example.test",
  SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD: "fixture-pass-a",
  SAAS_TEST_FIXTURE_CLINIC_B_EMAIL: "clinic-b@example.test",
  SAAS_TEST_FIXTURE_CLINIC_B_PASSWORD: "fixture-pass-b",
} as const;

function packetText(overrides: Partial<Record<keyof typeof packetValues, string>> = {}): string {
  const values = { ...packetValues, ...overrides };
  return Object.entries(values)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n");
}

function metadata(overrides: Partial<{
  uid: number;
  gid: number;
  mode: number;
  symlink: boolean;
  file: boolean;
}> = {}) {
  const values = { uid: 0, gid: 42, mode: 0o100640, symlink: false, file: true, ...overrides };
  return {
    uid: values.uid,
    gid: values.gid,
    mode: values.mode,
    isSymbolicLink: () => values.symlink,
    isFile: () => values.file,
  };
}

describe("SaaS TEST fixture packet", () => {
  it("accepts exactly the five data-only JSON-quoted keys", () => {
    expect(parseSaasTestFixturePacket(packetText())).toEqual(packetValues);
  });

  it.each([
    ["disabled", packetText({ SAAS_TEST_FIXTURE_ENABLED: "0" }), "explicit_enable_required"],
    ["duplicate", `${packetText()}\nSAAS_TEST_FIXTURE_ENABLED="1"`, "duplicate_key"],
    ["unknown DATABASE_URL", `${packetText()}\nDATABASE_URL="postgres://prod"`, "unknown_key"],
    ["unknown PGOPTIONS", `${packetText()}\nPGOPTIONS="-c role=postgres"`, "unknown_key"],
    ["malformed export", `export ${packetText()}`, "malformed_line"],
    ["unquoted", packetText().replace('="1"', "=1"), "malformed_line"],
    [
      "command substitution",
      packetText({ SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD: "$(touch /tmp/forbidden)" }),
      "unsafe_value",
    ],
    ["backticks", packetText({ SAAS_TEST_FIXTURE_CLINIC_A_PASSWORD: "`id`" }), "unsafe_value"],
    [
      "escaped command substitution",
      packetText().replace('"fixture-pass-a"', '"\\u0024(touch /tmp/forbidden)"'),
      "unsafe_value",
    ],
  ])("rejects %s", (_label, text, code) => {
    expect(() => parseSaasTestFixturePacket(text)).toThrow(code);
  });

  it("requires a non-symlink root:deploy 0640 regular file", () => {
    expect(() =>
      validateSaasTestFixturePacketMetadata(metadata(), { expectedOwnerId: 0, expectedGroupId: 42 }),
    ).not.toThrow();
    expect(() =>
      validateSaasTestFixturePacketMetadata(metadata({ symlink: true }), {
        expectedOwnerId: 0,
        expectedGroupId: 42,
      }),
    ).toThrow("symlink_forbidden");
    expect(() =>
      validateSaasTestFixturePacketMetadata(metadata({ uid: 1000 }), {
        expectedOwnerId: 0,
        expectedGroupId: 42,
      }),
    ).toThrow("owner_must_be_root");
    expect(() =>
      validateSaasTestFixturePacketMetadata(metadata({ gid: 1000 }), {
        expectedOwnerId: 0,
        expectedGroupId: 42,
      }),
    ).toThrow("group_must_be_deploy");
    expect(() =>
      validateSaasTestFixturePacketMetadata(metadata({ mode: 0o100600 }), {
        expectedOwnerId: 0,
        expectedGroupId: 42,
      }),
    ).toThrow("mode_must_be_0640");
  });
});

describe("SaaS TEST walkthrough reconciliation", () => {
  it("validates two distinct reserved-domain owner credentials", () => {
    const config = readSaasTestFixtureConfig(packetValues);
    expect(config.ownerA.emailNormalized).toBe("clinic-a@example.test");
    expect(config.ownerB.emailNormalized).toBe("clinic-b@example.test");
    expect(() =>
      readSaasTestFixtureConfig({
        ...packetValues,
        SAAS_TEST_FIXTURE_CLINIC_B_EMAIL: packetValues.SAAS_TEST_FIXTURE_CLINIC_A_EMAIL,
      }),
    ).toThrow("fixture_owner_emails_must_differ");
    expect(() =>
      readSaasTestFixtureConfig({
        ...packetValues,
        SAAS_TEST_FIXTURE_CLINIC_B_EMAIL: "real-address@example.com",
      }),
    ).toThrow("fixture_email_must_use_reserved_test_domain");
  });

  it("builds exact A/B linkage with five A patients and no B clinical rows", () => {
    const plan = buildSaasTestFixturePlan(new Date("2026-07-15T22:30:00.000Z"));
    expect(plan.clinics.map(({ key, patientCount }) => ({ key, patientCount }))).toEqual([
      { key: "A", patientCount: 5 },
      { key: "B", patientCount: 0 },
    ]);
    expect(plan.patients).toHaveLength(5);
    expect(plan.enrollments).toHaveLength(5);
    expect(plan.appointments).toHaveLength(10);
    expect(plan.enrollments.every((row) => row.organizationId === SAAS_TEST_FIXTURE_IDS.organizationA)).toBe(true);
    expect(plan.appointments.every((row) => row.organizationId === SAAS_TEST_FIXTURE_IDS.organizationA)).toBe(true);
    expect(plan.appointments.every((row) => row.specialistId === SAAS_TEST_FIXTURE_IDS.specialistA)).toBe(true);
    for (const patient of plan.patients) {
      expect(plan.enrollments.filter((row) => row.platformUserId === patient.id)).toHaveLength(1);
      expect(plan.appointments.filter((row) => row.platformUserId === patient.id)).toHaveLength(2);
    }
    expect(plan.appointments.filter((row) => row.status === "completed")).toHaveLength(5);
    expect(plan.appointments.filter((row) => row.status === "confirmed")).toHaveLength(5);
  });

  it("keeps all repo-reserved fixture IDs unique", () => {
    expect(new Set(Object.values(SAAS_TEST_FIXTURE_IDS).flat())).toHaveLength(28);
  });

  it("anchors representative past and future appointments to the current UTC day", () => {
    expect(resolveFixtureAppointmentTimes(new Date("2026-07-15T22:30:00.000Z"))).toEqual({
      pastStartAt: "2026-07-08T09:00:00.000Z",
      pastEndAt: "2026-07-08T10:00:00.000Z",
      futureStartAt: "2026-07-22T09:00:00.000Z",
      futureEndAt: "2026-07-22T10:00:00.000Z",
    });
  });

  it("never writes an arbitrary thrown error or secret sentinel to stderr", async () => {
    const stderr: string[] = [];
    const result = await runSaasTestFixtureCli({
      env: { NODE_ENV: "test" },
      run: async () => {
        throw new Error("SENTINEL_SECRET query=SELECT password_hash params=[secret]");
      },
      writeError: (message) => stderr.push(message),
    });
    expect(result).toBe(1);
    expect(stderr.join("")).toBe("[saas-test-fixture] FAILED\n");
    expect(stderr.join("")).not.toContain("SENTINEL_SECRET");
    expect(stderr.join("")).not.toContain("SELECT");
  });
});
