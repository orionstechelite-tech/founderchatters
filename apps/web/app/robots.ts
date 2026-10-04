import type { MetadataRoute } from 'next';

import { publicOrigin } from './marketing/public-metadata';

export default function robots(): MetadataRoute.Robots {
  const origin = publicOrigin();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/support/new', '/admin'],
    },
    sitemap: origin ? `${origin}/sitemap.xml` : undefined,
  };
}
