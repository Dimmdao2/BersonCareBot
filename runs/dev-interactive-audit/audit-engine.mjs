import { canonicalAuditUrl, routeTemplateKey } from './gate-utils.mjs';

/** Pure traversal/control policy used by the executable runner and its fault tests. */
export function buildTraversalPlan(scenario, baseUrl) {
  const canonical = scenario.canonicalNavigationDestinations ?? [];
  const stateSeeds = scenario.requiredStateSeeds ?? [];
  return {
    canonical: canonical.map((route) => new URL(route, baseUrl).href),
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

export function classifyControlInventory(nodes, role, route, adapters, classify) {
  const routeTemplate = canonicalAuditUrl(route);
  const inventory = nodes.map((node) => {
    const identity = stableControlIdentity(node);
    const control = { role, route: routeTemplate, kind: node.kind, identity };
    return {
      ...control,
      classification: identity ? classify(control, adapters) : null,
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
