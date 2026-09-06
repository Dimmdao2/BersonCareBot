import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * WHAT BREAKS: TEST bootstrap accepts different patient buckets for webapp and media-worker.
 * CONSEQUENCE: the worker writes HLS/posters to one bucket while webapp looks in another, so a
 * patient upload succeeds but playback remains silently unavailable.
 * ORACLE: the owner-approved cross-service contract in the patient-media-storage audit brief.
 * The real bootstrap self-test constructs mismatched env files and must reject them.
 */
describe('TEST patient-store bootstrap contract', () => {
  it('rejects a webapp/media-worker patient bucket disagreement', () => {
    const bootstrap = fileURLToPath(
      new URL('../../../deploy/host/bootstrap-c4-test-env.mjs', import.meta.url),
    );

    expect(() =>
      execFileSync(process.execPath, [bootstrap, '--self-test'], {
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});
