/**
 * Logger for platform-merge package (no @/ path; works in integrator + webapp).
 */
export const mergeLogger = {
  info: (meta: Record<string, unknown>, msg?: string) => {
    // eslint-disable-next-line no-console
    console.info("[platform-merge]", msg ?? "", meta);
  },
  error: (meta: Record<string, unknown>, msg?: string) => {
    // eslint-disable-next-line no-console
    console.error("[platform-merge]", msg ?? "", meta);
  },
};
