/**
 * K6 — `LogoutForm` is the single logout door for both surfaces (M3-03). Named поломка: in native
 * runtime, submitting the form before the native-push revoke attempt has even started would destroy the
 * session first and strand the DELETE call with no auth — the device keeps an active push target after
 * the user signed out, a silent security-adjacent leftover. Browser logout must stay byte-for-byte a
 * plain form POST — no JS interception, no native call attempted.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogoutForm } from './LogoutForm';

const mockRuntimeKind = vi.hoisted(() => ({ current: 'browser' as 'browser' | 'therapygo_android' }));

vi.mock('@/shared/hooks/useNativeRuntime', () => ({
  useNativeRuntime: () => ({ kind: mockRuntimeKind.current, version: '1.0', capabilities: { jitsi: false, media: false, push: true } }),
}));

const revokeMock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/lib/nativePush/nativePushClient', () => ({
  revokeNativePushBeforeLogout: revokeMock,
}));

afterEach(() => {
  vi.restoreAllMocks();
  revokeMock.mockReset();
});

function renderForm() {
  render(
    <LogoutForm>
      <button type="submit">Выйти</button>
    </LogoutForm>,
  );
  return screen.getByRole('button').closest('form') as HTMLFormElement;
}

describe('LogoutForm — browser runtime stays an unmodified plain POST', () => {
  it('never calls the native revoke and never prevents the default form submit', () => {
    mockRuntimeKind.current = 'browser';
    const form = renderForm();
    const submitSpy = vi.spyOn(form, 'submit').mockImplementation(() => {});

    const notCancelled = fireEvent.submit(form);

    expect(revokeMock).not.toHaveBeenCalled();
    expect(notCancelled).toBe(true); // dispatchEvent returns true when preventDefault() was never called
    expect(submitSpy).not.toHaveBeenCalled(); // our JS never calls .submit() itself in browser mode
  });
});

describe('LogoutForm — native runtime revokes before session destruction (K6 ordering)', () => {
  it('attempts revoke first and only calls form.submit() after the revoke settles', async () => {
    mockRuntimeKind.current = 'therapygo_android';
    let resolveRevoke: () => void = () => {};
    revokeMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRevoke = resolve;
        }),
    );

    const form = renderForm();
    const submitSpy = vi.spyOn(form, 'submit').mockImplementation(() => {});

    const notCancelled = fireEvent.submit(form);

    expect(notCancelled).toBe(false); // preventDefault() was called — native path intercepts the submit
    expect(revokeMock).toHaveBeenCalledWith('therapygo_android');
    expect(submitSpy).not.toHaveBeenCalled(); // must not submit before the revoke attempt has settled

    resolveRevoke();
    await vi.waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
  });

  it('still submits (best-effort) when the revoke attempt never settles — the timeout wins, never blocks logout', async () => {
    mockRuntimeKind.current = 'therapygo_android';
    revokeMock.mockImplementation(() => new Promise<void>(() => {})); // never resolves/rejects

    const form = renderForm();
    const submitSpy = vi.spyOn(form, 'submit').mockImplementation(() => {});

    fireEvent.submit(form);

    // Real implementation races the revoke against a 1500ms timeout; a hung revoke must not hang logout.
    await vi.waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });
});
