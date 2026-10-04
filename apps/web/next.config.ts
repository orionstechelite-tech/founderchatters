import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  agentRules: false,
  ...(process.env.E2E_WEB_BUILD === '1'
    ? {}
    : { output: 'standalone' as const }),
  poweredByHeader: false,
  transpilePackages: ['@founderchatters/ui'],
  async headers() {
    return [
      {
        source: '/verify-email',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        source: '/forgot-password',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
      {
        source: '/reset-password/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
};

export default nextConfig;
