import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  output: 'standalone',
  poweredByHeader: false,
  transpilePackages: ['@founderchatters/ui'],
};

export default nextConfig;
