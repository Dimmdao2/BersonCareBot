const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_ID_SEGMENT = /^[0-9a-f]{24,}$/i;

function redactSegment(segment) {
  if (UUID_SEGMENT.test(segment)) return ':uuid';
  if (OPAQUE_ID_SEGMENT.test(segment)) return ':id';
  return segment;
}

/** Preserve route-shaping query parameters while redacting identity-bearing values. */
export function canonicalAuditUrl(input, baseUrl = 'http://127.0.0.1:5200') {
  const value = new URL(input, baseUrl);
  const pathname = value.pathname
    .split('/')
    .map((segment) => redactSegment(segment))
    .join('/');
  const query = new URLSearchParams();
  for (const [key, raw] of [...value.searchParams.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    query.append(key, redactSegment(raw));
  }
  const serialized = query.toString();
  return `${pathname}${serialized ? `?${serialized}` : ''}`;
}

/** One representative URL per route shape, without walking every patient/program/entity row. */
export function routeTemplateKey(input, baseUrl = 'http://127.0.0.1:5200') {
  return canonicalAuditUrl(input, baseUrl);
}

export function exactUrlMatches(actual, expected, baseUrl = 'http://127.0.0.1:5200') {
  return canonicalAuditUrl(actual, baseUrl) === canonicalAuditUrl(expected, baseUrl);
}

export function shouldIgnoreRequestFailure({ errorText, harnessNavigationActive }) {
  return errorText === 'net::ERR_ABORTED' && harnessNavigationActive;
}

export function summarizeBinaryGate(results) {
  const violations = [];
  for (const result of results) {
    if (!result.authenticated) violations.push(`${result.role}:authentication`);
    if (!result.identity_assertion?.pass) violations.push(`${result.role}:identity`);
    for (const page of result.pages ?? []) {
      if (!page.pass) violations.push(`${result.role}:page:${page.url}`);
    }
    for (const action of result.action_checks ?? []) {
      if (!action.pass) violations.push(`${result.role}:action:${action.id}`);
    }
    if ((result.failures ?? []).length > 0) violations.push(`${result.role}:network`);
    if ((result.console_errors ?? []).length > 0) violations.push(`${result.role}:console`);
  }
  return { pass: violations.length === 0, violations };
}
