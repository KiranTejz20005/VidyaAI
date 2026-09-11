import type { NextConfig } from "next";
import path from "path";

const DEFAULT_BACKEND = "https://vidyaai-test.onrender.com";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https: blob: http: http://localhost:* http://127.0.0.1:*",
      "font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com",
      "connect-src 'self' https: wss: http://localhost:* ws://localhost:* https://apis.google.com",
      "frame-src 'self' https://accounts.google.com",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_BACKEND,
    NEXT_PUBLIC_SOCKET_URL:
      process.env.NEXT_PUBLIC_SOCKET_URL ?? process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_BACKEND,
  },
  async rewrites() {
    const backendOrigin = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const cleanOrigin = backendOrigin.replace(/\/api(?:\/v\d+)?\/?$/, "").replace(/\/+$/, "");
    return [
      {
        source: "/uploads/:path*",
        destination: `${cleanOrigin}/uploads/:path*`,
      },
      {
        source: "/api/uploads/:path*",
        destination: `${cleanOrigin}/uploads/:path*`,
      },
      {
        source: "/api/v1/uploads/:path*",
        destination: `${cleanOrigin}/uploads/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
