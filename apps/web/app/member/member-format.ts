import type {
  DiscoverFounder,
  MemberFounderProfile,
} from '@founderchatters/contracts';

export function initialsFrom(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!first) return 'FC';
  if (!last || parts.length === 1) {
    return Array.from(first).slice(0, 2).join('').toUpperCase() || 'FC';
  }
  const firstChar = Array.from(first)[0];
  const lastChar = Array.from(last)[0];
  if (!firstChar || !lastChar) return 'FC';
  return `${firstChar}${lastChar}`.toUpperCase();
}

export function formatLocation(
  city: string | null | undefined,
  country: string | null | undefined,
): string | null {
  const parts = [city?.trim(), country?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

export function founderLocation(founder: {
  city: string | null;
  country: string | null;
  company?: { city: string | null; country: string | null } | null;
}): string | null {
  return (
    formatLocation(founder.city, founder.country) ??
    formatLocation(founder.company?.city, founder.company?.country)
  );
}

export function discoverMeta(founder: DiscoverFounder): string {
  const location = formatLocation(founder.city, founder.country);
  return [founder.companyName, location].filter(Boolean).join(' · ');
}

export function canHelpSummary(founder: {
  expertise: Array<{ label: string }>;
  customExpertise: string | null;
}): string | null {
  const labels = [
    ...founder.expertise.map((topic) => topic.label),
    founder.customExpertise,
  ].filter((value): value is string => Boolean(value?.trim()));
  if (labels.length === 0) return null;
  return `Can help with ${labels.join(' · ')}`;
}

export function profileMeta(founder: MemberFounderProfile): string | null {
  const location = founderLocation(founder);
  const parts = [
    location,
    founder.company.industry,
    founder.company.stage,
  ].filter((value): value is string => Boolean(value?.trim()));
  return parts.length > 0 ? parts.join(' · ') : null;
}
