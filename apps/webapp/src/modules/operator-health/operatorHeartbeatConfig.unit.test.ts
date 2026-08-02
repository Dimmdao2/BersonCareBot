import { describe, expect, it } from 'vitest';
import {
  findOperatorHeartbeat,
  parseOperatorHeartbeatStaleOverrides,
  resolveHeartbeatStaleAfterSec,
} from './heartbeat';

describe('operator heartbeat runtime config', () => {
  it('does not substitute a compiled threshold when the database object lacks a value', () => {
    const definition = findOperatorHeartbeat('pipeline_delivery');
    expect(definition).toBeDefined();
    if (!definition) throw new Error('pipeline_delivery_definition_missing');

    expect(() =>
      resolveHeartbeatStaleAfterSec(
        definition,
        parseOperatorHeartbeatStaleOverrides(JSON.stringify({})),
      ),
    ).toThrow('runtime_setting_unavailable:operator_heartbeat_config');
  });
});
