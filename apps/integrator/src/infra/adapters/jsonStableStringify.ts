/**
 * Deterministic JSON serialization for integrator → webapp projection delivery.
 * Ensures the same logical event always produces the same wire string (key order,
 * nested objects), matching webapp raw-body hashing for idempotency.
 */
export function jsonStableStringify(value: unknown): string {
  return stringifyStable(value, new WeakSet<object>());
}

function stringifyStable(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'string') return JSON.stringify(value);
  if (t === 'number' || t === 'boolean') return JSON.stringify(value);
  if (t === 'bigint') return JSON.stringify(Number(value));
  if (Array.isArray(value)) {
    return `[${value.map((item) => stringifyStable(item === undefined ? null : item, seen)).join(',')}]`;
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) {
      throw new TypeError('Converting circular structure to JSON');
    }
    seen.add(obj);
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    const out = `{${keys.map((k) => `${JSON.stringify(k)}:${stringifyStable(obj[k], seen)}`).join(',')}}`;
    seen.delete(obj);
    return out;
  }
  return JSON.stringify(value);
}

/**
 * Builds the POST /api/integrator/events JSON body object (same optional fields as JSON.stringify spread).
 */
export function buildIntegratorEventsBodyObject(event: {
  eventType: string;
  eventId?: string;
  occurredAt?: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
}): Record<string, unknown> {
  const out: Record<string, unknown> = { eventType: event.eventType };
  if (event.eventId) out.eventId = event.eventId;
  if (event.occurredAt) out.occurredAt = event.occurredAt;
  if (event.idempotencyKey) out.idempotencyKey = event.idempotencyKey;
  if (event.payload && typeof event.payload === 'object') out.payload = event.payload;
  return out;
}

export function buildIntegratorEventsHttpBody(event: {
  eventType: string;
  eventId?: string;
  occurredAt?: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
}): string {
  return jsonStableStringify(buildIntegratorEventsBodyObject(event));
}
