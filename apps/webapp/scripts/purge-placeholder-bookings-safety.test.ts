import { describe, expect, it } from "vitest";
import { assertAllowedPurgeDatabaseTarget } from "./purge-placeholder-bookings-safety";

describe("placeholder purge database target guard", () => {
  it("allows exact loopback DEV and explicit TEST targets", () => {
    expect(() =>
      assertAllowedPurgeDatabaseTarget({
        databaseUrl: "postgresql://user:secret@127.0.0.1:5432/bcb_webapp_dev",
        currentDatabase: "bcb_webapp_dev",
        allowTestTarget: false,
      }),
    ).not.toThrow();
    expect(() =>
      assertAllowedPurgeDatabaseTarget({
        databaseUrl: "postgresql://user:secret@127.0.0.1:5432/bersoncarebot_test",
        currentDatabase: "bersoncarebot_test",
        allowTestTarget: true,
      }),
    ).not.toThrow();
  });

  it("rejects TEST without the explicit allow flag", () => {
    expect(() =>
      assertAllowedPurgeDatabaseTarget({
        databaseUrl: "postgresql://user:secret@127.0.0.1/bersoncarebot_test",
        currentDatabase: "bersoncarebot_test",
        allowTestTarget: false,
      }),
    ).toThrow("refusing_test_database_without_allow_flag");
  });

  it("rejects remote, production, arbitrary, and mismatched targets", () => {
    expect(() =>
      assertAllowedPurgeDatabaseTarget({
        databaseUrl: "postgresql://user:secret@db.example/bcb_webapp_dev",
        currentDatabase: "bcb_webapp_dev",
        allowTestTarget: false,
      }),
    ).toThrow("refusing_non_loopback_database_host");
    expect(() =>
      assertAllowedPurgeDatabaseTarget({
        databaseUrl: "postgresql://user:secret@127.0.0.1/bcb_webapp_prod",
        currentDatabase: "bcb_webapp_prod",
        allowTestTarget: true,
      }),
    ).toThrow("refusing_live_like_database");
    expect(() =>
      assertAllowedPurgeDatabaseTarget({
        databaseUrl: "postgresql://user:secret@127.0.0.1/postgres",
        currentDatabase: "postgres",
        allowTestTarget: false,
      }),
    ).toThrow("refusing_non_disposable_database_name");
    expect(() =>
      assertAllowedPurgeDatabaseTarget({
        databaseUrl: "postgresql://user:secret@127.0.0.1/bcb_webapp_dev",
        currentDatabase: "bersoncarebot_test",
        allowTestTarget: true,
      }),
    ).toThrow("refusing_database_name_mismatch");
  });

  describe("owner-gated authorized-prod-target unlock", () => {
    it("(a) refuses a live-like prod name when the flag is absent", () => {
      expect(() =>
        assertAllowedPurgeDatabaseTarget({
          databaseUrl: "postgresql://user:secret@127.0.0.1/bcb_webapp_prod",
          currentDatabase: "bcb_webapp_prod",
          allowTestTarget: false,
        }),
      ).toThrow("refusing_live_like_database");
      // Explicitly false flag behaves identically to absent.
      expect(() =>
        assertAllowedPurgeDatabaseTarget({
          databaseUrl: "postgresql://user:secret@127.0.0.1/bcb_webapp_prod",
          currentDatabase: "bcb_webapp_prod",
          allowTestTarget: false,
          allowAuthorizedProdTarget: false,
          authorizedProdDatabase: "bcb_webapp_prod",
        }),
      ).toThrow("refusing_live_like_database");
    });

    it("(b) allows a live-like prod name when the flag is set and the expected name matches exactly on loopback", () => {
      expect(() =>
        assertAllowedPurgeDatabaseTarget({
          databaseUrl: "postgresql://user:secret@127.0.0.1:5432/bcb_webapp_prod",
          currentDatabase: "bcb_webapp_prod",
          allowTestTarget: false,
          allowAuthorizedProdTarget: true,
          authorizedProdDatabase: "bcb_webapp_prod",
        }),
      ).not.toThrow();
    });

    it("(c) refuses when the flag is set but the expected name mismatches (typo)", () => {
      expect(() =>
        assertAllowedPurgeDatabaseTarget({
          databaseUrl: "postgresql://user:secret@127.0.0.1/bcb_webapp_prod",
          currentDatabase: "bcb_webapp_prod",
          allowTestTarget: false,
          allowAuthorizedProdTarget: true,
          authorizedProdDatabase: "bcb_webapp_prd",
        }),
      ).toThrow("refusing_authorized_prod_target_mismatch");
      // Flag set but no expected name supplied at all — fail closed with a distinct reason.
      expect(() =>
        assertAllowedPurgeDatabaseTarget({
          databaseUrl: "postgresql://user:secret@127.0.0.1/bcb_webapp_prod",
          currentDatabase: "bcb_webapp_prod",
          allowTestTarget: false,
          allowAuthorizedProdTarget: true,
        }),
      ).toThrow("refusing_authorized_prod_target_without_expected_database");
    });

    it("(d) never bypasses the loopback host check even with the flag set and an exact name match", () => {
      expect(() =>
        assertAllowedPurgeDatabaseTarget({
          databaseUrl: "postgresql://user:secret@db.example/bcb_webapp_prod",
          currentDatabase: "bcb_webapp_prod",
          allowTestTarget: false,
          allowAuthorizedProdTarget: true,
          authorizedProdDatabase: "bcb_webapp_prod",
        }),
      ).toThrow("refusing_non_loopback_database_host");
    });
  });
});
