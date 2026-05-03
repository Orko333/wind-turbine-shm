/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // plotly.js image-trace imports Node.js 'buffer/' — stub it out on the client.
      // We only use scatter traces so this code path is never executed at runtime.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'buffer': false,
        'buffer/': false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
