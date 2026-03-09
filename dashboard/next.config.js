/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['better-sqlite3'],
  allowedDevOrigins: ['http://45.32.33.109:3000'],
};

module.exports = nextConfig;
