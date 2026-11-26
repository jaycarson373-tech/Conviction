import type { NextConfig } from "next";

const config: NextConfig = {
  // PGlite (local dev DB) and the web3/Meteora SDKs stay as server-side node modules.
  serverExternalPackages: ["@electric-sql/pglite", "@meteora-ag/dynamic-bonding-curve-sdk", "@coral-xyz/anchor", "postgres"],
  poweredByHeader: false,
  // lib/schema.sql is read at runtime to bootstrap the database.
  outputFileTracingIncludes: { "/**": ["./lib/schema.sql"] },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default config;
