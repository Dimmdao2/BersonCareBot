/**
 * Stores human-entered text in Unicode NFC without imposing caller-specific
 * trimming, empty-value, or null policies.
 */
export function normalizeHumanText(value: string): string {
  return value.normalize('NFC');
}
