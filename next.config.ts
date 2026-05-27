import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist / pdf-parse load their worker via runtime dynamic import.
  // Keeping them out of the server bundle avoids Turbopack rewriting the path
  // (which produces bogus "[project]\...pdf.worker.mjs [app-route] (ecmascript)" paths).
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "agent-base"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {},
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        zlib: false,
        http: false,
        https: false,
        stream: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
