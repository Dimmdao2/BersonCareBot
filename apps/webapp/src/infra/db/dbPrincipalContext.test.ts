/** @vitest-environment node */

import {
  applyCurrentDbPrincipalToTransaction,
  ensureDbPrincipalContext,
  enterWithDbPatientPrincipal,
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
  normalizeDbPrincipalOrganizationId,
  runWithDbOrganizationPrincipal,
} from "@bersoncare/db-principal";
import { describe, expect, it, vi } from "vitest";

describe("DB principal context", () => {
  it("is unset by default and rejects invalid organization ids", () => {
    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
    expect(() => normalizeDbPrincipalOrganizationId("not-a-uuid")).toThrow("Invalid DB principal organization id");
  });

  it("does no SQL when no organization context is set", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

    await expect(applyCurrentDbPrincipalToTransaction({ query })).resolves.toBe(false);

    expect(query).not.toHaveBeenCalled();
  });

  it("restores nested organization contexts", () => {
    runWithDbOrganizationPrincipal("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", () => {
      expect(getCurrentDbPrincipalOrganizationId()).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");

      runWithDbOrganizationPrincipal("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", () => {
        expect(getCurrentDbPrincipalOrganizationId()).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
      });

      expect(getCurrentDbPrincipalOrganizationId()).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    });

    expect(getCurrentDbPrincipalOrganizationId()).toBeUndefined();
  });

  it("keeps concurrent organization contexts isolated", async () => {
    const applyForOrg = async (organizationId: string) =>
      runWithDbOrganizationPrincipal(organizationId, async () => {
        await new Promise((resolve) => setTimeout(resolve, organizationId.endsWith("a") ? 5 : 0));
        const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
        await applyCurrentDbPrincipalToTransaction({ query });
        return query.mock.calls[0];
      });

    await expect(
      Promise.all([
        applyForOrg("cccccccc-cccc-4ccc-8ccc-ccccccccccca"),
        applyForOrg("dddddddd-dddd-4ddd-8ddd-dddddddddddb"),
      ]),
    ).resolves.toEqual([
      ["SELECT set_config('app.org', $1, true)", ["cccccccc-cccc-4ccc-8ccc-ccccccccccca"]],
      ["SELECT set_config('app.org', $1, true)", ["dddddddd-dddd-4ddd-8ddd-dddddddddddb"]],
    ]);
  });

  it("keeps interleaved enterWith request principals isolated and resets stale context on next entry", async () => {
    let resumeA: (() => void) | undefined;
    const pauseA = new Promise<void>((resolve) => {
      resumeA = resolve;
    });

    const requestA = (async () => {
      ensureDbPrincipalContext({ source: "request-a:entry" });
      enterWithDbPatientPrincipal({
        organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        platformUserId: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
        source: "request-a",
      });
      await pauseA;
      return getCurrentDbPrincipal();
    })();

    const requestB = (async () => {
      ensureDbPrincipalContext({ source: "request-b:entry" });
      enterWithDbPatientPrincipal({
        organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        platformUserId: "bbbbbbbb-bbbb-4bbb-8bbb-000000000002",
        source: "request-b",
      });
      await Promise.resolve();
      return getCurrentDbPrincipal();
    })();

    const principalB = await requestB;
    resumeA?.();
    const principalA = await requestA;

    expect(principalA).toMatchObject({
      kind: "patient",
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      platformUserId: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001",
    });
    expect(principalB).toMatchObject({
      kind: "patient",
      organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      platformUserId: "bbbbbbbb-bbbb-4bbb-8bbb-000000000002",
    });

    ensureDbPrincipalContext({ source: "request-c:entry" });
    expect(getCurrentDbPrincipal()).toEqual({ kind: "bootstrap", source: "request-c:entry" });
  });
});
