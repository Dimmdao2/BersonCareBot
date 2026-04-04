import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    /** Allow importing canonical `normalizeToUtcInstant` from integrator shared (single source of truth). */
    externalDir: true,
  },
};

export default withAnalyzer(nextConfig);
