import { beforeEach, describe, expect, it, vi } from "vitest";

const events = vi.hoisted(() => new Map<string, number[]>());

const port = vi.hoisted(() => ({
  async countActive(params: { scope: string; key: string; windowMs: number }) {
    const now = Date.now();
    const mapKey = `${params.scope}:${params.key}`;
    const active = (events.get(mapKey) ?? []).filter((at) => at > now - params.windowMs);
    events.set(mapKey, active);
    return active.length;
  },
  async recordAndCount(params: {
    scope: string;
    key: string;
    windowMs: number;
    maxPerWindow: number;
  }) {
    const now = Date.now();
    const mapKey = `${params.scope}:${params.key}`;
    const active = (events.get(mapKey) ?? []).filter((at) => at > now - params.windowMs);
    if (active.length >= params.maxPerWindow) {
      return { limited: true, attempts: active.length };
    }
    if (params.scope.endsWith("_failure")) {
      active.fill(now);
    }
    active.push(now);
    events.set(mapKey, active);
    return { limited: false, attempts: active.length };
  },
  async reset(params: { scope: string; key: string }) {
    events.delete(`${params.scope}:${params.key}`);
  },
}));

vi.mock("@/modules/auth/authRateLimits", () => ({
  getAuthRateLimitDbPort: () => port,
}));

import {
  inspectPasswordIdentifierLock,
  passwordFailureDelaySeconds,
  recordPasswordIdentifierFailure,
  resetPasswordIdentifierFailures,
} from "./passwordLoginProtection";

describe("password login protection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T00:00:00.000Z"));
    events.clear();
  });

  it("uses the accepted exponential delay from failure 5 through 9", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(passwordFailureDelaySeconds)).toEqual([
      0,
      0,
      0,
      0,
      30,
      60,
      120,
      240,
      480,
      0,
    ]);
  });

  it("locks on the tenth failure and unlocks itself after fifteen minutes", async () => {
    const states = [];
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      states.push(await recordPasswordIdentifierFailure("owner@example.test"));
    }

    expect(states[8]).toMatchObject({ attempts: 9, delaySeconds: 480, locked: false });
    expect(states[9]).toEqual({
      attempts: 10,
      delaySeconds: 0,
      locked: true,
      retryAfterSeconds: 900,
    });
    await expect(inspectPasswordIdentifierLock("owner@example.test")).resolves.toMatchObject({
      locked: true,
      attempts: 10,
    });

    await vi.advanceTimersByTimeAsync(15 * 60 * 1000 + 1);

    await expect(inspectPasswordIdentifierLock("owner@example.test")).resolves.toBeNull();
    await expect(recordPasswordIdentifierFailure("owner@example.test")).resolves.toMatchObject({
      attempts: 1,
      delaySeconds: 0,
      locked: false,
    });
  });

  it("keeps consecutive failures through the accepted delays even when their total exceeds fifteen minutes", async () => {
    let state;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      state = await recordPasswordIdentifierFailure("owner@example.test");
      await vi.advanceTimersByTimeAsync(state.delaySeconds * 1000);
    }

    expect(state).toMatchObject({ attempts: 10, locked: true });
  });

  it("starts from the first failure again after a successful proof resets the identifier", async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await recordPasswordIdentifierFailure("owner@example.test");
    }

    await resetPasswordIdentifierFailures("owner@example.test");

    await expect(recordPasswordIdentifierFailure("owner@example.test")).resolves.toEqual({
      attempts: 1,
      delaySeconds: 0,
      locked: false,
    });
  });
});
