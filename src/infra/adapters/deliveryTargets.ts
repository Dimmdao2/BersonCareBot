/**
 * Converts channelBindings (from webapp reminder/booking dispatch) to a list of delivery targets.
 * Used when fanning out a single notification to multiple channels (telegram, max).
 */

export type DeliveryTarget = {
  channel: 'telegram' | 'max';
  externalId: string;
};

const BINDING_KEYS: Array<{ key: string; channel: 'telegram' | 'max' }> = [
  { key: 'telegramId', channel: 'telegram' },
  { key: 'maxId', channel: 'max' },
];

/**
 * Returns delivery targets for fan-out. Only includes channels present in bindings with non-empty externalId.
 */
export function channelBindingsToTargets(bindings: Record<string, string> | undefined): DeliveryTarget[] {
  if (!bindings || typeof bindings !== 'object') return [];
  const out: DeliveryTarget[] = [];
  for (const { key, channel } of BINDING_KEYS) {
    const id = bindings[key];
    if (typeof id === 'string' && id.trim().length > 0) {
      out.push({ channel, externalId: id.trim() });
    }
  }
  return out;
}
