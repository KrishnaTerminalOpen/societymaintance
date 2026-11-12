/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@colony/shared'],
  serverExternalPackages: ['ioredis'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
