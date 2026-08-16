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

/** A redirect is acceptable only when the scenario declares its exact route shape. */
export function routeContractMatches(actual, expected, allowedFinalTemplates = []) {
  const finalUrl = canonicalAuditUrl(actual);
  return (
    exactUrlMatches(actual, expected) ||
    allowedFinalTemplates.some((template) => finalUrl === template)
  );
}

/** A scenario has to name the disposition of every rendered route shape. */
export function classifyRoute(scenario, input) {
  const template = routeTemplateKey(input);
  const matches = (scenario.routeClassifications ?? []).filter((entry) =>
    typeof entry.template === 'string' ? entry.template === template : entry.template.test(template),
  );
  if (matches.length === 0 && (scenario.requiredStateSeeds ?? []).some((seed) => routeTemplateKey(seed) === template)) {
    return { template, pass: true, classification: 'substantive' };
  }
  if (matches.length !== 1) {
    return {
      template,
      pass: false,
      reason: matches.length === 0 ? 'route_unclassified' : 'route_classification_ambiguous',
    };
  }
  return { template, pass: true, ...matches[0] };
}

/** Explicit, route-scoped contracts prevent an app shell from becoming proof. */
export function routeSelectors(scenario, input) {
  return scenario.routeEvidence?.[routeTemplateKey(input)] ?? [];
}

export function discoverBounded({ knownTemplates, hrefs, scenario, limit }) {
  const discovered = [];
  const violations = [];
  for (const href of hrefs) {
    const value = new URL(href, 'http://127.0.0.1:5200');
    if (!scenario.allowedPathnames.some((prefix) => value.pathname.startsWith(prefix))) continue;
    const template = routeTemplateKey(href);
    if (knownTemplates.has(template)) continue;
    if (discovered.length >= limit) {
      violations.push(`discovery_cap_exceeded:${limit}`);
      break;
    }
    knownTemplates.add(template);
    discovered.push({ href, template, classification: classifyRoute(scenario, href) });
  }
  return { discovered, violations };
}

export function aggregateRoleArtifacts({ currentResults, artifacts, requiredRoles, expected }) {
  const violations = [];
  const all = [...currentResults, ...artifacts.flatMap((artifact) => artifact.results ?? [])];
  const byRole = new Map();
  for (const result of all) {
    const provenance = result.audit_provenance;
    if (!provenance) {
      violations.push(`${result.role}:artifact_provenance_missing`);
      continue;
    }
    for (const [key, value] of Object.entries(expected)) {
      if (value !== null && provenance[key] !== value) violations.push(`${result.role}:artifact_${key}_mismatch`);
    }
    if (byRole.has(result.role)) violations.push(`${result.role}:duplicate_role_artifact`);
    byRole.set(result.role, result);
  }
  for (const role of requiredRoles) if (!byRole.has(role)) violations.push(`${role}:missing_role_artifact`);
  return { results: [...byRole.values()], violations };
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
  return { pass: reasons.length === 0, reasons };
}

export function shouldIgnoreRequestFailure({ errorText, harnessNavigationActive }) {
  return errorText === 'net::ERR_ABORTED' && harnessNavigationActive;
}

export function summarizeBinaryGate(results, requiredRoles = []) {
  const violations = [];
  const observedRoles = new Set(results.map((result) => result.role));
  for (const role of requiredRoles) {
    if (!observedRoles.has(role)) violations.push(`${role}:missing_role_artifact`);
  }
  for (const result of results) {
    if (!result.authenticated) violations.push(`${result.role}:authentication`);
    if (!result.identity_assertion?.pass) violations.push(`${result.role}:identity`);
    for (const page of result.pages ?? []) {
      if (!page.pass) violations.push(`${result.role}:page:${page.url}`);
    }
    for (const action of result.action_checks ?? []) {
      if (!action.pass) violations.push(`${result.role}:action:${action.id}`);
    }
    for (const violation of result.discovery_violations ?? []) {
      violations.push(`${result.role}:${violation}`);
    }
    for (const control of result.rendered_controls ?? []) {
      if (!control.classification) violations.push(`${result.role}:control_unclassified:${control.id}`);
    }
    if ((result.failures ?? []).length > 0) violations.push(`${result.role}:network`);
    if ((result.console_errors ?? []).length > 0) violations.push(`${result.role}:console`);
  }
  return { pass: violations.length === 0, violations };
}
