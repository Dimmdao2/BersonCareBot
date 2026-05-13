import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const allowedDevOrigins = [
  "127.0.0.1:15200",
  "localhost:15200",
  ...(process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins,
  output: "standalone",
  async redirects() {
    const diarySymptomsDest = "/app/patient/diary?tab=symptoms";
    const diaryLfkDest = "/app/patient/diary?tab=lfk";
    return [
      { source: "/app/patient/diary/symptoms", destination: diarySymptomsDest, permanent: true },
      { source: "/app/patient/diary/symptoms/", destination: diarySymptomsDest, permanent: true },
      { source: "/app/patient/diary/lfk", destination: diaryLfkDest, permanent: true },
      { source: "/app/patient/diary/lfk/", destination: diaryLfkDest, permanent: true },
      { source: "/app/patient/treatment-programs", destination: "/app/patient/treatment", permanent: true },
      { source: "/app/patient/treatment-programs/", destination: "/app/patient/treatment", permanent: true },
      {
        source: "/app/patient/treatment-programs/:path*",
        destination: "/app/patient/treatment/:path*",
        permanent: true,
      },
    ];
  },
  /** Native / dynamic-require deps: do not bundle for Turbopack (media preview worker). */
  serverExternalPackages: [
    "sharp",
    "fluent-ffmpeg",
    "@ffmpeg-installer/ffmpeg",
    "@ffmpeg-installer/linux-x64",
    "@ffmpeg-installer/linux-arm64",
    "@ffmpeg-installer/darwin-x64",
    "@ffmpeg-installer/darwin-arm64",
  ],
  transpilePackages: [
    "react-phone-number-input",
    "@toast-ui/editor",
    "@toast-ui/react-editor",
    "@bersoncare/booking-rubitime-sync",
    "@bersoncare/operator-db-schema",
  ],
  experimental: {
    /** Allow importing canonical `normalizeToUtcInstant` from integrator shared (single source of truth). */
    externalDir: true,
  },
};

export default withAnalyzer(nextConfig);
