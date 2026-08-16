const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_ID_SEGMENT = /^[0-9a-f]{24,}$/i;
const PAGINATION_QUERY_KEYS = new Set([
  'cursor',
  'date',
  'from',
  'limit',
  'offset',
  'page',
  'to',
  'week',
]);

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
  const value = new URL(canonicalAuditUrl(input, baseUrl), baseUrl);
  for (const key of PAGINATION_QUERY_KEYS) {
    if (value.searchParams.has(key)) value.searchParams.set(key, ':sample');
  }
  return `${value.pathname}${value.search ? value.search : ''}`;
}

/** Match one declared route contract, including named single-segment placeholders. */
export function routePatternMatches(pattern, input, baseUrl = 'http://127.0.0.1:5200') {
  const expected = new URL(pattern, baseUrl);
  const actual = new URL(canonicalAuditUrl(input, baseUrl), baseUrl);
  const expectedSegments = expected.pathname.split('/');
  const actualSegments = actual.pathname.split('/');
  if (expectedSegments.length !== actualSegments.length) return false;
  if (
    !expectedSegments.every(
      (segment, index) => segment.startsWith(':') || segment === actualSegments[index],
    )
  ) {
    return false;
  }

  const expectedQuery = [...expected.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const actualQuery = [...actual.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (expectedQuery.length !== actualQuery.length) return false;
  return expectedQuery.every(([key, value], index) => {
    const [actualKey, actualValue] = actualQuery[index] ?? [];
    return key === actualKey && (value.startsWith(':') || value === actualValue);
  });
}

export function exactUrlMatches(actual, expected, baseUrl = 'http://127.0.0.1:5200') {
  return canonicalAuditUrl(actual, baseUrl) === canonicalAuditUrl(expected, baseUrl);
}

/** A redirect is acceptable only when the scenario declares its exact route shape. */
export function routeContractMatches(actual, expected, allowedFinalTemplates = []) {
  const finalUrl = canonicalAuditUrl(actual);
  return (
    exactUrlMatches(actual, expected) ||
    allowedFinalTemplates.some((template) => finalUrl === template)
  );
}

/**
 * Keep page acceptance independent from copy.  A route contract names one or
 * more rendered, unique functional/landmark anchors; a shell cannot satisfy it.
 */
export function evaluatePageObservation({
  responseOk,
  urlOk,
  visibleFatal,
  mainCount,
  anchors = [],
  failures = [],
  consoleErrors = [],
  consoleWarnings = [],
}) {
  const reasons = [];
  if (!responseOk) reasons.push('navigation_not_ok');
  if (!urlOk) reasons.push('unexpected_final_url');
  if (visibleFatal) reasons.push('visible_error_boundary');
  if (mainCount !== 1) reasons.push(`main_count:${mainCount}`);
  if (!anchors.some((anchor) => anchor.count === 1 && anchor.visible)) {
    reasons.push(
      anchors.length === 0
        ? 'route_semantic_contract_missing'
        : `functional_anchor_missing_or_ambiguous:${anchors.map((anchor) => anchor.name).join('|')}`,
    );
  }
  if (failures.length) reasons.push(`network_failures:${failures.length}`);
  if (consoleErrors.length) reasons.push(`console_errors:${consoleErrors.length}`);
  if (consoleWarnings.length) reasons.push(`console_warnings:${consoleWarnings.length}`);
  return { pass: reasons.length === 0, reasons };
}

export function shouldIgnoreRequestFailure({
  errorText,
  harnessNavigationActive,
  url = '',
  resourceType = '',
}) {
  if (errorText !== 'net::ERR_ABORTED') return false;
  if (harnessNavigationActive) return true;
  try {
    const requestUrl = new URL(url, 'http://127.0.0.1:5200');
    return resourceType === 'fetch' && requestUrl.searchParams.has('_rsc');
  } catch {
    return false;
  }
}

export function summarizeBinaryGate(results, requiredRoles = []) {
  const violations = [];
  const observedRoles = new Set(results.map((result) => result.role));
  for (const role of requiredRoles) {
    if (!observedRoles.has(role)) violations.push(`${role}:missing_role_artifact`);
  }
  for (const result of results) {
    if (result.complete === false) violations.push(`${result.role}:incomplete`);
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
    if ((result.console_warnings ?? []).length > 0)
      violations.push(`${result.role}:console_warning`);
  }
  return { pass: violations.length === 0, violations };
}
