/** @vitest-environment jsdom */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PatientUnsupportedClientFallback } from "@/app/app/PatientUnsupportedClientFallback";
import {
  CLIENT_BOOT_ACTIVE_CONTENT_ID,
  CLIENT_BOOT_FALLBACK_ID,
  buildClientBootWatchdogScript,
} from "./clientBootWatchdog";
import { parseSupportedClientEnvironment, toClientEnvironmentTelemetry } from "./supportedClientMatrix";

const client = toClientEnvironmentTelemetry(parseSupportedClientEnvironment(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 Version/15.5 Mobile Safari/604.1",
));

class FakeXhr {
  static bodies: string[] = [];
  open(): void {}
  setRequestHeader(): void {}
  send(body: string): void { FakeXhr.bodies.push(body); }
}

function installDom(): void {
  document.body.innerHTML = `<div id="${CLIENT_BOOT_ACTIVE_CONTENT_ID}">loading</div><section id="${CLIENT_BOOT_FALLBACK_ID}" hidden>fallback</section>`;
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: undefined });
  Object.defineProperty(navigator, "storage", { configurable: true, value: undefined });
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
}

function evaluateWatchdog(): void {
  window.eval(buildClientBootWatchdogScript({ entrySurface: "browser", client, timeoutMs: 1_000 }));
}

describe("unsupported client watchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeXhr.bodies = [];
    installDom();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete window.__bcBootWatch;
  });

  it("keeps the SSR fallback hidden until zero-module timeout, then reports a bounded category", () => {
    evaluateWatchdog();
    expect(document.getElementById(CLIENT_BOOT_FALLBACK_ID)).toHaveAttribute("hidden");
    vi.advanceTimersByTime(1_000);
    expect(document.getElementById(CLIENT_BOOT_FALLBACK_ID)).not.toHaveAttribute("hidden");
    expect(document.getElementById(CLIENT_BOOT_ACTIVE_CONTENT_ID)).toHaveAttribute("hidden");
    const body = JSON.parse(FakeXhr.bodies[0] ?? "{}") as { failureSignals?: Record<string, unknown> };
    expect(body.failureSignals).toMatchObject({
      moduleExecuted: false,
      reactMounted: false,
      failureKind: "module_never_executed",
      capturedError: "none",
    });
  });

  it("cancels the fallback and report after a healthy module and React mount", () => {
    evaluateWatchdog();
    window.__bcBootWatch?.ok("module_executed");
    window.__bcBootWatch?.ok("react_mounted");
    vi.advanceTimersByTime(2_000);
    expect(document.getElementById(CLIENT_BOOT_FALLBACK_ID)).toHaveAttribute("hidden");
    expect(FakeXhr.bodies).toEqual([]);
  });

  it("distinguishes module execution without React mount", () => {
    evaluateWatchdog();
    window.__bcBootWatch?.ok("module_executed");
    vi.advanceTimersByTime(1_000);
    const body = JSON.parse(FakeXhr.bodies[0] ?? "{}") as { failureSignals?: Record<string, unknown> };
    expect(body.failureSignals).toMatchObject({
      moduleExecuted: true,
      reactMounted: false,
      failureKind: "module_executed_not_mounted",
    });
  });

  it("restores healthy content if React mounts after the fallback became visible", () => {
    evaluateWatchdog();
    vi.advanceTimersByTime(1_000);
    window.__bcBootWatch?.ok("react_mounted");
    expect(document.getElementById(CLIENT_BOOT_FALLBACK_ID)).toHaveAttribute("hidden");
    expect(document.getElementById(CLIENT_BOOT_ACTIVE_CONTENT_ID)).not.toHaveAttribute("hidden");
  });

  it("stays classic ES5 syntax and dependency free", () => {
    const script = buildClientBootWatchdogScript({ entrySurface: "tg", client });
    expect(script).toMatch(/^\(function\(\)\{/);
    expect(script).not.toMatch(/\b(?:const|let|class|import|export)\b|=>|\?\.|<\/script/i);
    expect(script).toContain("window");
    expect(script).toContain("XMLHttpRequest");
  });

  it("renders the approved support fallback and device fact in server HTML", () => {
    const parsed = parseSupportedClientEnvironment(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 Version/15.5 Mobile Safari/604.1",
    );
    const html = renderToStaticMarkup(
      <PatientUnsupportedClientFallback client={parsed} entrySurface="browser" supportContactHref="/app/contact-support" />,
    );
    expect(html).toContain(`id="${CLIENT_BOOT_FALLBACK_ID}"`);
    expect(html).toContain("hidden");
    expect(html).toContain("Что-то пошло не так на вашем устройстве");
    expect(html).toContain('href="/app/contact-support"');
    expect(html).toContain("Ваше устройство: iPhone, iOS 15.5, Safari");
  });
});
