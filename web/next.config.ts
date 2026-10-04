import type { NextConfig } from "next";

// The Go API (server/). Browser requests to /api/* are proxied here so the
// API needs no CORS and its address stays private.
const apiURL = process.env.API_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiURL}/api/:path*` }];
  },
};

export default nextConfig;
