/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
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
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://test1111ww-wind-turbine-shm-api.hf.space',
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
