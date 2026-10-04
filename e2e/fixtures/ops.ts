import { newId, queryOne } from '../helpers/db.js';
import { createPublishedRequest } from './requests.js';
import type { E2eUser } from './users.js';

export async function findApplicationId(userId: string): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM "FounderApplication" WHERE "userId" = $1`,
    [userId],
  );
  return row.id;
}

export async function createRequestLinkedConversation(
  requester: E2eUser,
  helper: E2eUser,
): Promise<{ id: string; requestId: string }> {
  const request = await createPublishedRequest(requester);
  const conversation = await queryOne<{ id: string }>(
    `INSERT INTO "Conversation" (id, "requestId", status, "updatedAt")
     VALUES ($1, $2, 'ACTIVE', NOW())
     RETURNING id`,
    [newId('cnv'), request.id],
  );
  await queryOne(
    `INSERT INTO "ConversationParticipant" ("conversationId", "userId")
     VALUES ($1, $2)
     RETURNING "conversationId"`,
    [conversation.id, requester.id],
  );
  await queryOne(
    `INSERT INTO "ConversationParticipant" ("conversationId", "userId")
     VALUES ($1, $2)
     RETURNING "conversationId"`,
    [conversation.id, helper.id],
  );
  await queryOne(
    `INSERT INTO "Message" (id, "conversationId", "senderId", body)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      newId('msg'),
      conversation.id,
      helper.id,
      'Fictional request-linked advice about marketplace GTM.',
    ],
  );
  return { id: conversation.id, requestId: request.id };
}

export async function createOpenReport(
  reporter: E2eUser,
  requestId: string,
): Promise<{ id: string }> {
  return queryOne<{ id: string }>(
    `INSERT INTO "Report" (
      id, "reporterId", "targetType", "targetId", "reasonCode", details, status, "updatedAt"
    ) VALUES ($1, $2, 'REQUEST', $3, 'SPAM_PROMOTION', $4, 'OPEN', NOW())
    RETURNING id`,
    [
      newId('rpt'),
      reporter.id,
      requestId,
      'Fictional promotional noise on a public request.',
    ],
  );
}

export async function createOpenSupportCase(): Promise<{ id: string }> {
  return queryOne<{ id: string }>(
    `INSERT INTO "SupportCase" (
      id, email, category, subject, status, "updatedAt"
    ) VALUES ($1, $2, 'ACCOUNT', $3, 'OPEN', NOW())
    RETURNING id`,
    [
      newId('sup'),
      'smoke-support@example.com',
      'Cannot open the fictional verification email.',
    ],
  );
}

export async function createHelpedContribution(
  requester: E2eUser,
  helper: E2eUser,
): Promise<{ id: string }> {
  const request = await createPublishedRequest(requester, {
    headline: `${requester.displayName} needs contribution fixture help`,
  });
  const confirmation = await queryOne<{ id: string }>(
    `INSERT INTO "HelpConfirmation" (
      id, "requestId", "confirmerId", "helperId", outcome
    ) VALUES ($1, $2, $3, $4, 'HELPED')
    RETURNING id`,
    [newId('hcf'), request.id, requester.id, helper.id],
  );
  const contribution = await queryOne<{ id: string }>(
    `INSERT INTO "Contribution" (id, "helpConfirmationId", "contributorId")
     VALUES ($1, $2, $3)
     RETURNING id`,
    [newId('ctr'), confirmation.id, helper.id],
  );
  const topic = await queryOne<{ id: string }>(
    `SELECT id FROM "TaxonomyTopic" WHERE slug = 'product'`,
  );
  await queryOne(
    `INSERT INTO "ContributionTopic" ("contributionId", "topicId")
     VALUES ($1, $2)
     RETURNING "contributionId"`,
    [contribution.id, topic.id],
  );
  return contribution;
}

export async function createFailedNotificationDelivery(
  user: E2eUser,
): Promise<{ id: string }> {
  const notification = await queryOne<{ id: string }>(
    `INSERT INTO "Notification" (id, "userId", type, title, body)
     VALUES ($1, $2, 'APPLICATION_APPROVED', $3, $4)
     RETURNING id`,
    [
      newId('ntf'),
      user.id,
      'Application approved',
      'Fictional approval notification for route smoke.',
    ],
  );
  return queryOne<{ id: string }>(
    `INSERT INTO "NotificationDelivery" (
      id, "notificationId", channel, "templateVersion", status,
      "lastErrorCode", "attemptCount", "updatedAt"
    ) VALUES ($1, $2, 'EMAIL', 'v1', 'FAILED', 'PROVIDER_ERROR', 1, NOW())
    RETURNING id`,
    [newId('ndl'), notification.id],
  );
}

export async function findNotificationTemplateId(): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM "NotificationTemplate" ORDER BY "createdAt" ASC`,
  );
  return row.id;
}

export async function createAuditEntry(
  actor: E2eUser,
): Promise<{ id: string }> {
  return queryOne<{ id: string }>(
    `INSERT INTO "AuditLog" (
      id, "actorUserId", action, "targetType", "targetId", reason
    ) VALUES ($1, $2, 'MEMBER_SUSPENDED', 'USER', $3, $4)
    RETURNING id`,
    [newId('aud'), actor.id, actor.id, 'Fictional audit fixture.'],
  );
}

export async function createFailedJob(): Promise<{ id: string }> {
  return queryOne<{ id: string }>(
    `INSERT INTO "JobFailure" (
      id, queue, "jobName", "jobId", "errorCode", message, attempts
    ) VALUES ($1, 'notifications', 'deliver-email', $2, 'PROVIDER_ERROR', $3, 1)
    RETURNING id`,
    [newId('job'), newId('jid'), 'Fictional provider failure for route smoke.'],
  );
}
