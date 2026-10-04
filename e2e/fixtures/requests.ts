import { newId, queryOne } from '../helpers/db.js';
import type { E2eUser } from './users.js';

export async function createPublishedRequest(
  author: E2eUser,
  options?: {
    headline?: string;
    context?: string;
    topicSlug?: string;
  },
): Promise<{ id: string; headline: string }> {
  const headline =
    options?.headline ?? `${author.displayName} needs marketplace GTM advice`;
  const context =
    options?.context ??
    'We are a fictional two-person team preparing a marketplace launch and need operator advice on first-city GTM.';
  const topic = await queryOne<{ id: string }>(
    `SELECT id FROM "TaxonomyTopic" WHERE slug = $1`,
    [options?.topicSlug ?? 'product'],
  );
  const request = await queryOne<{ id: string }>(
    `INSERT INTO "Request" (
      id, "authorId", type, status, headline, context, "whoCouldHelp",
      urgency, "publishedAt", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    RETURNING id`,
    [
      newId('req'),
      author.id,
      'ASK',
      'PUBLISHED',
      headline,
      context,
      'Operators who have launched a marketplace.',
      'SOON',
      new Date(),
    ],
  );
  await queryOne(
    `INSERT INTO "RequestTopic" ("requestId", "topicId") VALUES ($1, $2)
     RETURNING "requestId"`,
    [request.id, topic.id],
  );
  return { id: request.id, headline };
}
