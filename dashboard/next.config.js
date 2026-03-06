/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['better-sqlite3']
  },
  serverExternalPackages: ['better-sqlite3']
};

module.exports = nextConfig;
