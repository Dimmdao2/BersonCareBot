import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DoctorSupportUnreadProvider } from './DoctorSupportUnreadProvider';

afterEach(() => vi.unstubAllGlobals());

describe('doctor shell hidden-module background work', () => {
  it('starts no hidden chat, comment, or rehabilitation badge request', async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        requested.push(String(input));
        return { ok: true, json: async () => ({ tasks: [] }) } as Response;
      }),
    );

    render(
      <DoctorSupportUnreadProvider
        directChatEnabled={false}
        programCommentsEnabled={false}
        rehabilitationEnabled={false}
      >
        <span />
      </DoctorSupportUnreadProvider>,
    );

    await waitFor(() => expect(requested).toContain('/api/doctor/tasks?limit=200'));
    expect(requested).toEqual(['/api/doctor/tasks?limit=200']);
  });
});
