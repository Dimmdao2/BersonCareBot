import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PatientUnsupportedClientFallback } from '@/app/app/PatientUnsupportedClientFallback';
import {
  CLIENT_BOOT_ACTIVE_CONTENT_ID,
  CLIENT_BOOT_FALLBACK_ID,
  buildClientBootWatchdogScript,
} from './clientBootWatchdog';
import {
  parseSupportedClientEnvironment,
  toClientEnvironmentTelemetry,
} from './supportedClientMatrix';

const parsedClient = parseSupportedClientEnvironment(
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 Version/15.5 Mobile Safari/604.1',
);
const client = toClientEnvironmentTelemetry(parsedClient);

class FakeXhr {
  static bodies: string[] = [];

  open(): void {}

  setRequestHeader(): void {}

  send(body: string): void {
    FakeXhr.bodies.push(body);
  }
}

function installBootShell(): void {
  document.body.innerHTML = [
    `<div id="${CLIENT_BOOT_ACTIVE_CONTENT_ID}">loading</div>`,
    `<section id="${CLIENT_BOOT_FALLBACK_ID}" hidden>fallback</section>`,
  ].join('');
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'storage', { configurable: true, value: undefined });
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
}

function evaluateWatchdog(input: { failureTimeoutEnabled: boolean; timeoutMs?: number }): void {
  window.eval(
    buildClientBootWatchdogScript({
      entrySurface: 'browser',
      client,
      failureTimeoutEnabled: input.failureTimeoutEnabled,
      timeoutMs: input.timeoutMs,
    }),
  );
}

describe('unsupported client boot watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeXhr.bodies = [];
    installBootShell();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete window.__bcBootWatch;
  });

  it('never classifies a slow healthy development compilation as an unsupported client', () => {
    evaluateWatchdog({ failureTimeoutEnabled: false, timeoutMs: 10_000 });

    vi.advanceTimersByTime(180_000);
    expect(document.getElementById(CLIENT_BOOT_FALLBACK_ID)).toHaveAttribute('hidden');
    expect(document.getElementById(CLIENT_BOOT_ACTIVE_CONTENT_ID)).not.toHaveAttribute('hidden');
    expect(FakeXhr.bodies).toEqual([]);

    window.__bcBootWatch?.ok('module_executed');
    window.__bcBootWatch?.ok('react_mounted');
    vi.runOnlyPendingTimers();

    expect(document.getElementById(CLIENT_BOOT_FALLBACK_ID)).toHaveAttribute('hidden');
    expect(document.getElementById(CLIENT_BOOT_ACTIVE_CONTENT_ID)).not.toHaveAttribute('hidden');
    expect(FakeXhr.bodies).toEqual([]);
  });

  it.each([
    ['module never executed', undefined, 'none'],
    [
      'hard syntax failure',
      () =>
        window.dispatchEvent(
          new ErrorEvent('error', {
            message: 'SyntaxError',
            error: new SyntaxError('synthetic'),
          }),
        ),
      'syntax_error',
    ],
  ] as const)(
    'shows and reports the production fallback when %s',
    (_scenario, dispatchFailure, expectedCapturedError) => {
      evaluateWatchdog({ failureTimeoutEnabled: true, timeoutMs: 10_000 });
      dispatchFailure?.();

      vi.advanceTimersByTime(10_000);

      expect(document.getElementById(CLIENT_BOOT_FALLBACK_ID)).not.toHaveAttribute('hidden');
      expect(document.getElementById(CLIENT_BOOT_ACTIVE_CONTENT_ID)).toHaveAttribute('hidden');
      const report = JSON.parse(FakeXhr.bodies[0] ?? '{}') as {
        failureSignals?: {
          moduleExecuted?: boolean;
          reactMounted?: boolean;
          failureKind?: string;
          capturedError?: string;
        };
      };
      expect(report.failureSignals).toMatchObject({
        moduleExecuted: false,
        reactMounted: false,
        failureKind: 'module_never_executed',
        capturedError: expectedCapturedError,
      });
    },
  );

  it('cancels the production fallback after a healthy module and React mount', () => {
    evaluateWatchdog({ failureTimeoutEnabled: true, timeoutMs: 10_000 });
    window.__bcBootWatch?.ok('module_executed');
    window.__bcBootWatch?.ok('react_mounted');

    vi.advanceTimersByTime(60_000);

    expect(document.getElementById(CLIENT_BOOT_FALLBACK_ID)).toHaveAttribute('hidden');
    expect(document.getElementById(CLIENT_BOOT_ACTIVE_CONTENT_ID)).not.toHaveAttribute('hidden');
    expect(FakeXhr.bodies).toEqual([]);
  });

  it('reports a production module that executed but never mounted React', () => {
    evaluateWatchdog({ failureTimeoutEnabled: true, timeoutMs: 10_000 });
    window.__bcBootWatch?.ok('module_executed');

    vi.advanceTimersByTime(10_000);

    expect(document.getElementById(CLIENT_BOOT_FALLBACK_ID)).not.toHaveAttribute('hidden');
    expect(document.getElementById(CLIENT_BOOT_ACTIVE_CONTENT_ID)).toHaveAttribute('hidden');
    const report = JSON.parse(FakeXhr.bodies[0] ?? '{}') as {
      failureSignals?: {
        moduleExecuted?: boolean;
        reactMounted?: boolean;
        failureKind?: string;
      };
    };
    expect(report.failureSignals).toMatchObject({
      moduleExecuted: true,
      reactMounted: false,
      failureKind: 'module_executed_not_mounted',
    });
  });

  it('renders the fallback hidden in server markup before any script executes', () => {
    const html = renderToStaticMarkup(
      <PatientUnsupportedClientFallback
        client={parsedClient}
        entrySurface="browser"
        failureTimeoutEnabled={false}
        supportContactHref="/app/contact-support"
      />,
    );

    document.body.innerHTML = html;
    const fallback = document.getElementById(CLIENT_BOOT_FALLBACK_ID);

    expect(fallback).not.toBeNull();
    expect(fallback).toHaveAttribute('hidden');
  });
});
