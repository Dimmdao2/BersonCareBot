import { canonicalAuditUrl, classifyRoute, routeTemplateKey } from './gate-utils.mjs';

/** Pure traversal/control policy used by the executable runner and its fault tests. */
export function buildTraversalPlan(scenario, baseUrl) {
  const canonicalTemplates = new Set(
    (scenario.canonicalNavigationDestinations ?? []).map((route) => routeTemplateKey(route)),
  );
  const stateSeeds = (scenario.requiredStateSeeds ?? []).filter(
    (route) => !canonicalTemplates.has(routeTemplateKey(route)),
  );
  return {
    navigationRoots: (scenario.canonicalNavigationRoots ?? []).map((route) => new URL(route, baseUrl).href),
    stateSeeds: stateSeeds.map((route) => new URL(route, baseUrl).href),
  };
}

/** Canonical product-nav destinations must be reached by rendered navigation/BFS, never direct seeds. */
export function missingCanonicalNavigation(scenario, renderedOrDiscoveredUrls) {
  const seen = new Set(renderedOrDiscoveredUrls.map((url) => routeTemplateKey(url)));
  return (scenario.canonicalNavigationDestinations ?? []).filter(
    (route) => !seen.has(routeTemplateKey(route)),
  );
}

export function stableControlIdentity(node) {
  const identity = node.id || node.name || node.ariaLabel || node.testId || null;
  return identity?.trim() || null;
}

/** Product navigation is observed from rendered nav containers, never the manifest. */
export function observeNavigationHrefs({ hrefs, scenario, baseUrl }) {
  const observed = [];
  const violations = [];
  for (const href of hrefs) {
    const url = new URL(href, baseUrl);
    if (url.origin !== new URL(baseUrl).origin) continue;
    if (!scenario.allowedPathnames.some((prefix) => url.pathname.startsWith(prefix))) continue;
    const classification = classifyRoute(scenario, url.href);
    if (!classification.pass) {
      violations.push(`navigation_route_${classification.reason}:${routeTemplateKey(url.href)}`);
      continue;
    }
    observed.push({ href: url.href, template: routeTemplateKey(url.href), classification });
  }
  return { observed, violations };
}

/**
 * This is the queue used by the live runner.  It deliberately receives only
 * rendered navigation hrefs for canonical destinations; state seeds are the
 * explicit non-navigation prerequisites.
 */
export function initializeRenderedTraversal({ scenario, baseUrl, navigationHrefs }) {
  const plan = buildTraversalPlan(scenario, baseUrl);
  const navigation = observeNavigationHrefs({ hrefs: navigationHrefs, scenario, baseUrl });
  const queue = [];
  const queuedTemplates = new Set();
  const enqueue = (href) => {
    const template = routeTemplateKey(href);
    if (queuedTemplates.has(template)) return;
    queuedTemplates.add(template);
    queue.push(href);
  };
  for (const item of navigation.observed) enqueue(item.href);
  for (const href of plan.stateSeeds) enqueue(href);
  return {
    queue,
    queuedTemplates,
    canonicalNavigationSeen: navigation.observed.map((item) => item.href),
    violations: navigation.violations,
  };
}

export function classifyInventoryLink({ node, role, route, scenario, observedTemplates, adapters, classify }) {
  const href = node.href?.trim() ?? '';
  if (!href) return null;
  const baseUrl = 'http://127.0.0.1:5200';
  const url = new URL(href, baseUrl);
  const allowed = url.origin === new URL(baseUrl).origin
    && scenario.allowedPathnames.some((prefix) => url.pathname.startsWith(prefix));
  if (allowed) {
    const target = routeTemplateKey(url.href);
    const disposition = classifyRoute(scenario, url.href);
    return disposition.pass && observedTemplates.has(target) ? 'inspected_navigation' : null;
  }
  const explicit = classify({ role, route: canonicalAuditUrl(route), kind: 'link', identity: stableControlIdentity(node), href }, adapters);
  if (explicit) return explicit;
  // A link outside this role's bounded traversal is never implicitly safe:
  // external/contact/session-changing links need a route/control-owned entry.
  return null;
}

export function classifyControlInventory(nodes, role, route, adapters, classify, options = {}) {
  const routeTemplate = canonicalAuditUrl(route);
  const inventory = nodes.map((node) => {
    const identity = stableControlIdentity(node);
    const control = { role, route: routeTemplate, kind: node.kind, identity };
    return {
      ...control,
      href: node.href ?? null,
      classification: node.kind === 'link'
        ? classifyInventoryLink({
          node,
          role,
          route,
          scenario: options.scenario ?? { allowedPathnames: [], routeClassifications: [] },
          observedTemplates: options.observedTemplates ?? new Set(),
          adapters,
          classify,
        })
        : identity ? classify(control, adapters) : null,
    };
  });
  const duplicates = new Set();
  const counts = new Map();
  for (const control of inventory) {
    if (!control.identity) continue;
    const key = `${control.role}|${control.route}|${control.kind}|${control.identity}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of counts) if (count > 1) duplicates.add(key);
  return inventory.map((control) => ({
    ...control,
    duplicate: control.identity
      ? duplicates.has(`${control.role}|${control.route}|${control.kind}|${control.identity}`)
      : false,
  }));
}

function selectorPrimitive(selector) {
  if (typeof selector === 'string') {
    const id = selector.match(/^#([A-Za-z][\w-]*)$/)?.[1];
    if (id) return { kind: 'id', value: id };
    const aria = selector.match(/^\[aria-label="(.+)"\]$/)?.[1];
    if (aria) return { kind: 'aria', value: aria };
    return null;
  }
  if (selector?.kind === 'patient_messages') return { kind: 'semantic', value: 'patient_messages' };
  if (selector?.kind === 'text' && typeof selector.text === 'string') return { kind: 'text', value: selector.text };
  if (selector?.kind === 'compound' && Array.isArray(selector.all)) return { kind: 'compound', value: selector.all };
  return null;
}

const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mts', '.mjs'];

function sourceRecord(source, index) {
  return typeof source === 'string' ? { path: `source-${index}.tsx`, source } : source;
}

function routePath(template) {
  return typeof template === 'string' ? template.split('?')[0] : null;
}

function routeSegments(path) {
  return path.split('/').filter(Boolean);
}

function pageRoute(path) {
  const marker = '/src/app/';
  const offset = path.replaceAll('\\', '/').indexOf(marker);
  if (offset < 0 || !/\/page\.[cm]?[jt]sx?$/.test(path)) return null;
  return routeSegments(path.slice(offset + marker.length).replace(/\/page\.[cm]?[jt]sx?$/, ''))
    .filter((segment) => !/^\(.+\)$/.test(segment));
}

function routeOwnsPage(template, page) {
  const route = routePath(template);
  if (!route || !page) return false;
  const expected = routeSegments(route);
  for (let index = 0; index < page.length; index += 1) {
    const segment = page[index];
    if (/^\[\.\.\./.test(segment)) return index < expected.length;
    if (index >= expected.length || (!/^\[.+\]$/.test(segment) && segment !== expected[index])) return false;
  }
  return page.length === expected.length;
}

function importedPaths(record, recordsByPath) {
  const imported = [...record.source.matchAll(/(?:from\s*|import\s*\(|export\s+[^;]*?from\s*)["']([^"']+)["']/g)]
    .map((match) => match[1]);
  const resolved = [];
  for (const specifier of imported) {
    const base = specifier.startsWith('@/')
      ? `${record.path.slice(0, record.path.indexOf('/src/') + 5)}${specifier.slice(2)}`
      : specifier.startsWith('.')
        ? new URL(specifier, `file://${record.path}`).pathname
        : null;
    if (!base) continue;
    for (const candidate of [base, ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`), ...SOURCE_EXTENSIONS.map((extension) => `${base}/index${extension}`)]) {
      if (recordsByPath.has(candidate)) {
        resolved.push(candidate);
        break;
      }
    }
  }
  return resolved;
}

function reachableRouteSource(template, records) {
  const recordsByPath = new Map(records.map((record) => [record.path, record]));
  const owners = records
    .filter((record) => routeOwnsPage(template, pageRoute(record.path)))
    .sort((left, right) => (pageRoute(left.path)?.filter((segment) => /^\[\.\.\./.test(segment)).length ?? 0)
      - (pageRoute(right.path)?.filter((segment) => /^\[\.\.\./.test(segment)).length ?? 0));
  if (!owners.length) return null;
  const ownerDirectory = owners[0].path.slice(0, owners[0].path.lastIndexOf('/') + 1);
  const pending = [owners[0].path, ...records
    .filter((record) => record.path.startsWith(ownerDirectory))
    .map((record) => record.path)];
  const visited = new Set();
  let source = '';
  while (pending.length) {
    const path = pending.pop();
    if (visited.has(path)) continue;
    visited.add(path);
    const record = recordsByPath.get(path);
    if (!record) continue;
    source += `\n${record.source}`;
    pending.push(...importedPaths(record, recordsByPath));
  }
  return source;
}

/** Static drift gate: proves a live contract belongs to the route page module or one of its imports. */
export function staticContractViolations(scenarios, productSource, tabContracts = []) {
  const records = (Array.isArray(productSource) ? productSource : [productSource])
    .map(sourceRecord)
    .filter((record) => typeof record?.source === 'string' && typeof record.path === 'string');
  const check = (selector, label, source) => {
    const primitive = selectorPrimitive(selector);
    if (!primitive) return [`${label}:unsupported_semantic_contract`];
    if (primitive.kind === 'compound') return primitive.value.flatMap((part) => check(part, label, source));
    if (primitive.kind === 'semantic') return [];
    if (!source) return [`${label}:route_owner_source_missing`];
    const escaped = primitive.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const exists = primitive.kind === 'id'
      ? new RegExp(`\\bid\\s*=\\s*["']${escaped}["']`).test(source)
      : primitive.kind === 'aria'
        ? new RegExp(`\\baria-label\\s*=\\s*["']${escaped}["']`).test(source)
        : source.includes(primitive.value);
    return exists ? [] : [`${label}:product_semantic_primitive_missing:${primitive.value}`];
  };
  const violations = [];
  for (const [role, scenario] of Object.entries(scenarios)) {
    for (const entry of scenario.routeClassifications ?? []) {
      const label = `${role}:${typeof entry.template === 'string' ? entry.template : entry.template}`;
      const source = reachableRouteSource(entry.staticTemplate ?? entry.template, records);
      for (const selector of entry.semanticContract?.selectors ?? []) violations.push(...check(selector, label, source));
    }
  }
  for (const [tab, , contract] of tabContracts) {
    const source = reachableRouteSource('/app/doctor/patients/:uuid?tab=overview', records);
    violations.push(...check(contract, `doctor_patient_tab:${tab}`, source));
  }
  return violations;
}

/** The runner and fault tests share the exact eight-tab/program-link gate. */
export function validateDoctorPatientTabTraversal({ expectedTabs, tabProofs, programHref }) {
  const violations = [];
  for (const [tab] of expectedTabs) {
    const proof = tabProofs.find((item) => item.tab === tab);
    if (!proof || !proof.pass) violations.push(`doctor_patient_tab_missing_or_failed:${tab}`);
  }
  if (!programHref) violations.push('rendered_program_detail_href_missing_while_program_tab_active');
  return { pass: violations.length === 0, violations };
}
