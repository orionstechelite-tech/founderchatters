import type { Metadata } from 'next';

function siteOrigin(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, '');
  return raw || undefined;
}

export function publicPageMetadata({
  title,
  description,
  path,
  index = true,
}: {
  title: string;
  description: string;
  path: string;
  index?: boolean;
}): Metadata {
  const origin = siteOrigin();
  const canonical = origin ? `${origin}${path}` : path;
  return {
    title,
    description,
    alternates: { canonical },
    robots: index ? undefined : { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: origin ? canonical : undefined,
    },
  };
}

export function publicOrigin(): string | undefined {
  return siteOrigin();
}
