import type { MetadataRoute } from 'next';

import { publicOrigin } from './marketing/public-metadata';

const PUBLIC_PATHS = [
  '/',
  '/how-it-works',
  '/for-founders',
  '/guidelines',
  '/privacy',
  '/terms',
  '/support',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicOrigin();
  if (!origin) return [];
  return PUBLIC_PATHS.map((path) => ({
    url: `${origin}${path === '/' ? '/' : path}`,
    changeFrequency: 'monthly' as const,
    priority: path === '/' ? 1 : 0.6,
  }));
}
