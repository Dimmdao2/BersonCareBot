/** Canonical responsive thresholds for the doctor workspace (CSS pixels). */
export const DOCTOR_VIEWPORT = {
  /** Right sheets are usable from compact portrait tablets/foldables upward. */
  rightPanelMin: 540,
  /** Tailwind `md`: mobile header/bottom-nav switch to the sidebar rail. */
  navigationRailMin: 768,
  /** Tailwind `lg`: master-detail pages may mount both panes. */
  splitPaneMin: 1024,
  /** Tailwind `xl`: wide pages may keep auxiliary panels permanently visible. */
  wideWorkspaceMin: 1280,
} as const;

export const DOCTOR_VIEWPORT_QUERY = {
  phone: `(max-width: ${DOCTOR_VIEWPORT.rightPanelMin - 1}px)`,
  mobileShell: `(max-width: ${DOCTOR_VIEWPORT.navigationRailMin - 1}px)`,
  navigationRail: `(min-width: ${DOCTOR_VIEWPORT.navigationRailMin}px)`,
  splitPane: `(min-width: ${DOCTOR_VIEWPORT.splitPaneMin}px)`,
  wideWorkspace: `(min-width: ${DOCTOR_VIEWPORT.wideWorkspaceMin}px)`,
} as const;
