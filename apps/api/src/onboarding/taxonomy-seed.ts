import {
  ONBOARDING_TAXONOMY_TOPICS,
  type OnboardingTopic,
} from '@founderchatters/contracts';

import type { PrismaService } from '../database/prisma.service.js';

let seeded = false;

/**
 * Explicit local/dev/test taxonomy seed. Call from `prisma/seed.ts` or tests
 * only. HTTP handlers and AppModule must never invoke this.
 *
 * Command: `npx prisma db seed` (script: `npx tsx prisma/seed.ts`).
 */
export async function ensureOnboardingTaxonomy(
  prisma: Pick<PrismaService, 'taxonomyTopic'>,
  force = false,
): Promise<void> {
  if (seeded && !force) {
    return;
  }
  for (const topic of ONBOARDING_TAXONOMY_TOPICS as readonly OnboardingTopic[]) {
    await prisma.taxonomyTopic.upsert({
      where: { slug: topic.slug },
      update: {
        isActive: true,
        mergedIntoId: null,
      },
      create: {
        slug: topic.slug,
        label: topic.label,
        isActive: true,
      },
    });
  }
  seeded = true;
}
