import { afterEach, describe, expect, it, vi } from "vitest";
import type { DbPort } from "../../contracts/index.js";
import {
  buildExerciseReminderWebAppUrls,
  patientPathFromReminderTargetUrl,
} from "./reminderMessengerWebAppUrls.js";

vi.mock("../../../config/appBaseUrl.js", () => ({
  getAppBaseUrl: vi.fn(async () => "https://app.example"),
}));

const buildTelegramStub = vi.hoisted(() =>
  vi.fn(() => "https://app.example/app/tg?t=tgst"),
);
const buildMaxStub = vi.hoisted(() =>
  vi.fn(() => "https://app.example/app/max?t=maxst"),
);

vi.mock("../../../integrations/webappEntryToken.js", () => ({
  buildWebappEntryUrl: buildTelegramStub,
  buildWebappEntryUrlForMax: buildMaxStub,
}));

const dbStub = {} as DbPort;

describe("patientPathFromReminderTargetUrl", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("defaults when empty", () => {
    expect(patientPathFromReminderTargetUrl("")).toBe(
      "/app/patient/reminders?from=reminder",
    );
  });

  it("keeps path starting with slash", () => {
    expect(patientPathFromReminderTargetUrl("/app/patient/reminders?q=1")).toBe(
      "/app/patient/reminders?q=1",
    );
  });

  it("parses pathname+search from absolute URL", () => {
    expect(patientPathFromReminderTargetUrl("https://foo.example/foo/bar?q=9")).toBe(
      "/foo/bar?q=9",
    );
  });

  it("falls back on invalid URL string", () => {
    expect(patientPathFromReminderTargetUrl("not a url :::")).toBe(
      "/app/patient/reminders?from=reminder",
    );
  });
});

describe("buildExerciseReminderWebAppUrls", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("builds Telegram /app/tg URLs with t and next", async () => {
    const res = await buildExerciseReminderWebAppUrls({
      db: dbStub,
      channel: "telegram",
      chatId: 42,
      externalId: "42",
      integratorUserId: "u1",
      reminderTargetUrl: "/app/patient/reminders?from=ex",
    });
    expect(res).not.toBeNull();
    const primary = new URL(res!.primaryWebAppUrl);
    expect(primary.pathname).toBe("/app/tg");
    expect(primary.searchParams.get("t")).toBe("tgst");
    expect(primary.searchParams.get("next")).toBe("/app/patient/reminders?from=ex");

    const sched = new URL(res!.scheduleWebAppUrl);
    expect(sched.pathname).toBe("/app/tg");
    expect(sched.searchParams.has("t")).toBe(true);
    expect(sched.searchParams.get("next")).toBe("/app/patient/reminders?from=reminder");

    expect(buildTelegramStub).toHaveBeenCalledWith(
      { chatId: 42, integratorUserId: "u1" },
      "https://app.example",
    );
    expect(buildMaxStub).not.toHaveBeenCalled();
  });

  it("builds MAX /app/max URLs with t and next", async () => {
    const res = await buildExerciseReminderWebAppUrls({
      db: dbStub,
      channel: "max",
      chatId: 0,
      externalId: "max-user-77",
      integratorUserId: "u-max",
      reminderTargetUrl: "https://other/x/y",
    });
    expect(res).not.toBeNull();
    const primary = new URL(res!.primaryWebAppUrl);
    expect(primary.pathname).toBe("/app/max");
    expect(primary.searchParams.get("t")).toBe("maxst");
    expect(primary.searchParams.get("next")).toBe("/x/y");

    expect(buildMaxStub).toHaveBeenCalledWith(
      { maxId: "max-user-77", integratorUserId: "u-max" },
      "https://app.example",
    );
    expect(buildTelegramStub).not.toHaveBeenCalled();
  });

  it("uses fallback patient path for invalid reminderTargetUrl in built URLs", async () => {
    const res = await buildExerciseReminderWebAppUrls({
      db: dbStub,
      channel: "telegram",
      chatId: 1,
      externalId: "1",
      integratorUserId: "u",
      reminderTargetUrl: "not a url :::",
    });
    expect(res).not.toBeNull();
    const primary = new URL(res!.primaryWebAppUrl);
    expect(primary.pathname).toBe("/app/tg");
    expect(primary.searchParams.get("next")).toBe("/app/patient/reminders?from=reminder");
  });

  it("returns null when token builder yields null", async () => {
    buildTelegramStub.mockImplementationOnce(() => null as unknown as string);
    const res = await buildExerciseReminderWebAppUrls({
      db: dbStub,
      channel: "telegram",
      chatId: 42,
      externalId: "42",
      integratorUserId: "u1",
      reminderTargetUrl: "/x",
    });
    expect(res).toBeNull();
  });
});
