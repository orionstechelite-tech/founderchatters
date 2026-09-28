import 'dotenv/config';

import pg from 'pg';

const { Client } = pg;

const expectedTables = [
  'AdminRole',
  'ApplicationStatusEvent',
  'AuditLog',
  'Block',
  'Company',
  'Contribution',
  'ContributionTopic',
  'Conversation',
  'ConversationParticipant',
  'EmailVerificationToken',
  'FounderApplication',
  'FounderExpertise',
  'FounderNeed',
  'FounderProfile',
  'HelpConfirmation',
  'IntroductionOffer',
  'JobFailure',
  'Message',
  'ModerationAction',
  'Notification',
  'NotificationDelivery',
  'NotificationTemplate',
  'PasswordResetToken',
  'Permission',
  'PlatformSetting',
  'Report',
  'Request',
  'RequestResponse',
  'RequestTopic',
  'RolePermission',
  'SavedFounder',
  'Session',
  'SupportCase',
  'SupportMessage',
  'TaxonomyTopic',
  'ThankYouNote',
  'User',
  'UserAdminRole',
];

const expectedEnums = {
  ApplicationStatus: ['DRAFT', 'SUBMITTED', 'NEEDS_INFO', 'APPROVED', 'REJECTED'],
  ConversationStatus: ['ACTIVE', 'CLOSED'],
  HelpOutcome: ['HELPED', 'STILL_TALKING', 'NOT_HELPFUL'],
  IntroductionStatus: ['OFFERED', 'CONSENT_PENDING', 'INTRODUCED', 'DECLINED', 'CANCELLED'],
  NotificationDeliveryStatus: ['QUEUED', 'SENT', 'FAILED', 'RETRY_QUEUED'],
  ReportStatus: ['OPEN', 'UNDER_REVIEW', 'DISMISSED', 'ENFORCED'],
  ReportTargetType: ['USER', 'REQUEST', 'RESPONSE', 'MESSAGE'],
  RequestStatus: ['DRAFT', 'PUBLISHED', 'RESOLVED', 'DELETED_BY_AUTHOR', 'MODERATED_REMOVED'],
  RequestType: ['ASK', 'FEEDBACK', 'INTRODUCTION', 'COLLABORATION'],
  ResponseType: ['ADVICE', 'INTRODUCTION_OFFER', 'PRIVATE_CHAT_OFFER'],
  SupportCaseStatus: ['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED'],
  UserStatus: ['ACTIVE', 'SUSPENDED', 'DELETED'],
};

const criticalConstraints = [
  'Block_distinct_users_check',
  'Contribution_helpConfirmationId_fkey',
  'NotificationDelivery_attemptCount_nonnegative_check',
  'SavedFounder_distinct_users_check',
];

const criticalIndexes = [
  'ApplicationStatusEvent_applicationId_createdAt_idx',
  'AuditLog_targetType_targetId_idx',
  'Contribution_contributorId_createdAt_idx',
  'HelpConfirmation_helperId_outcome_createdAt_idx',
  'HelpConfirmation_requestId_confirmerId_helperId_key',
  'Message_conversationId_clientMessageId_key',
  'Message_conversationId_createdAt_idx',
  'NotificationDelivery_notificationId_channel_templateVersion_key',
  'Notification_userId_readAt_createdAt_idx',
  'Report_targetType_targetId_idx',
  'Request_status_publishedAt_idx',
  'TaxonomyTopic_isActive_label_idx',
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSetContains(actual, expected, label) {
  const missing = expected.filter((item) => !actual.has(item));
  assert(missing.length === 0, `${label} missing: ${missing.join(', ')}`);
}

async function expectDatabaseError(client, label, expectedCode, operation) {
  const savepoint = `verify_${label.replaceAll(/[^a-z0-9]/gi, '_')}`;
  await client.query(`SAVEPOINT ${savepoint}`);

  let caught;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }

  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  assert(caught, `${label} unexpectedly succeeded`);
  assert(caught.code === expectedCode, `${label} returned ${caught.code ?? 'no SQLSTATE'}, expected ${expectedCode}`);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  assert(process.env.DATABASE_URL, 'DATABASE_URL is required');
  await client.connect();

  const tablesResult = await client.query(`
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename <> '_prisma_migrations'
  `);
  const actualTables = new Set(tablesResult.rows.map(({ tablename }) => tablename));
  assertSetContains(actualTables, expectedTables, 'tables');
  assert(actualTables.size === expectedTables.length, `unexpected public tables: ${[...actualTables].filter((table) => !expectedTables.includes(table)).join(', ')}`);

  const enumsResult = await client.query(`
    SELECT type.typname AS name,
           array_agg(enum.enumlabel::text ORDER BY enum.enumsortorder) AS labels
      FROM pg_type AS type
      JOIN pg_enum AS enum ON enum.enumtypid = type.oid
      JOIN pg_namespace AS namespace ON namespace.oid = type.typnamespace
     WHERE namespace.nspname = 'public'
     GROUP BY type.typname
  `);
  const actualEnums = new Map(enumsResult.rows.map(({ name, labels }) => [name, labels]));
  for (const [name, labels] of Object.entries(expectedEnums)) {
    assert(actualEnums.has(name), `enum missing: ${name}`);
    assert(JSON.stringify(actualEnums.get(name)) === JSON.stringify(labels), `enum labels differ for ${name}`);
  }
  assert(actualEnums.size === Object.keys(expectedEnums).length, 'unexpected public enums exist');

  const constraintsResult = await client.query(`
    SELECT conname
      FROM pg_constraint AS db_constraint
      JOIN pg_namespace AS namespace ON namespace.oid = db_constraint.connamespace
     WHERE namespace.nspname = 'public'
  `);
  assertSetContains(new Set(constraintsResult.rows.map(({ conname }) => conname)), criticalConstraints, 'constraints');

  const indexesResult = await client.query(`
    SELECT indexname
      FROM pg_indexes
     WHERE schemaname = 'public'
  `);
  assertSetContains(new Set(indexesResult.rows.map(({ indexname }) => indexname)), criticalIndexes, 'indexes');

  const triggerResult = await client.query(`
    SELECT trigger_name
      FROM information_schema.triggers
     WHERE trigger_schema = 'public'
  `);
  assertSetContains(
    new Set(triggerResult.rows.map(({ trigger_name }) => trigger_name)),
    ['Contribution_integrity_trigger', 'HelpConfirmation_integrity_trigger'],
    'triggers',
  );

  const foreignKeyActions = await client.query(`
    SELECT conname, confdeltype
      FROM pg_constraint
     WHERE contype = 'f'
       AND conname = ANY($1::text[])
  `, [[
    'AuditLog_actorUserId_fkey',
    'Conversation_requestId_fkey',
    'Message_senderId_fkey',
    'Report_reporterId_fkey',
  ]]);
  const actions = new Map(foreignKeyActions.rows.map(({ conname, confdeltype }) => [conname, confdeltype]));
  assert(actions.get('AuditLog_actorUserId_fkey') === 'n', 'audit actors must use ON DELETE SET NULL');
  for (const constraint of ['Conversation_requestId_fkey', 'Message_senderId_fkey', 'Report_reporterId_fkey']) {
    assert(actions.get(constraint) === 'r', `${constraint} must use ON DELETE RESTRICT`);
  }

  await client.query('BEGIN');
  await client.query(`
    INSERT INTO "User" ("id", "email", "passwordHash", "updatedAt") VALUES
      ('verify-author', 'verify-author@example.invalid', 'not-a-real-password-hash', NOW()),
      ('verify-helper', 'verify-helper@example.invalid', 'not-a-real-password-hash', NOW()),
      ('verify-other', 'verify-other@example.invalid', 'not-a-real-password-hash', NOW())
  `);

  await client.query(`
    INSERT INTO "FounderProfile" ("id", "userId", "displayName", "updatedAt")
    VALUES ('verify-profile', 'verify-author', 'Verification Author', NOW())
  `);
  await expectDatabaseError(client, 'unique_profile', '23505', () =>
    client.query(`
      INSERT INTO "FounderProfile" ("id", "userId", "displayName", "updatedAt")
      VALUES ('verify-profile-duplicate', 'verify-author', 'Duplicate', NOW())
    `),
  );

  await expectDatabaseError(client, 'self_save', '23514', () =>
    client.query(`INSERT INTO "SavedFounder" ("saverId", "savedFounderId") VALUES ('verify-author', 'verify-author')`),
  );
  await expectDatabaseError(client, 'self_block', '23514', () =>
    client.query(`INSERT INTO "Block" ("blockerId", "blockedId") VALUES ('verify-author', 'verify-author')`),
  );

  await client.query(`
    INSERT INTO "Request" ("id", "authorId", "type", "headline", "context", "updatedAt")
    VALUES
      ('verify-request-helped', 'verify-author', 'ASK', 'Verification request', 'Constraint verification', NOW()),
      ('verify-request-not-helped', 'verify-author', 'ASK', 'Second verification request', 'Constraint verification', NOW())
  `);
  await client.query(`
    INSERT INTO "RequestResponse" ("id", "requestId", "authorId", "type", "body", "updatedAt")
    VALUES
      ('verify-response-helper', 'verify-request-helped', 'verify-helper', 'ADVICE', 'Verification response', NOW()),
      ('verify-response-other', 'verify-request-helped', 'verify-other', 'ADVICE', 'Other response', NOW())
  `);

  await expectDatabaseError(client, 'confirmation_not_by_author', '23514', () =>
    client.query(`
      INSERT INTO "HelpConfirmation" ("id", "requestId", "confirmerId", "helperId", "outcome")
      VALUES ('verify-invalid-confirmer', 'verify-request-helped', 'verify-other', 'verify-helper', 'HELPED')
    `),
  );
  await expectDatabaseError(client, 'confirmation_response_mismatch', '23514', () =>
    client.query(`
      INSERT INTO "HelpConfirmation" ("id", "requestId", "confirmerId", "helperId", "responseId", "outcome")
      VALUES ('verify-invalid-response', 'verify-request-helped', 'verify-author', 'verify-helper', 'verify-response-other', 'HELPED')
    `),
  );

  await client.query(`
    INSERT INTO "HelpConfirmation" ("id", "requestId", "confirmerId", "helperId", "responseId", "outcome")
    VALUES ('verify-confirmation-helped', 'verify-request-helped', 'verify-author', 'verify-helper', 'verify-response-helper', 'HELPED')
  `);
  await expectDatabaseError(client, 'wrong_contributor', '23514', () =>
    client.query(`
      INSERT INTO "Contribution" ("id", "helpConfirmationId", "contributorId")
      VALUES ('verify-wrong-contributor', 'verify-confirmation-helped', 'verify-other')
    `),
  );
  await client.query(`
    INSERT INTO "Contribution" ("id", "helpConfirmationId", "contributorId")
    VALUES ('verify-contribution', 'verify-confirmation-helped', 'verify-helper')
  `);
  await expectDatabaseError(client, 'contribution_outcome_downgrade', '23514', () =>
    client.query(`UPDATE "HelpConfirmation" SET "outcome" = 'STILL_TALKING' WHERE "id" = 'verify-confirmation-helped'`),
  );

  await client.query(`
    INSERT INTO "HelpConfirmation" ("id", "requestId", "confirmerId", "helperId", "outcome")
    VALUES ('verify-confirmation-not-helped', 'verify-request-not-helped', 'verify-author', 'verify-helper', 'NOT_HELPFUL')
  `);
  await expectDatabaseError(client, 'not_helped_contribution', '23514', () =>
    client.query(`
      INSERT INTO "Contribution" ("id", "helpConfirmationId", "contributorId")
      VALUES ('verify-not-helped-contribution', 'verify-confirmation-not-helped', 'verify-helper')
    `),
  );

  await client.query(`
    INSERT INTO "Conversation" ("id", "requestId", "updatedAt")
    VALUES ('verify-conversation', 'verify-request-helped', NOW())
  `);
  await client.query(`
    INSERT INTO "Message" ("id", "conversationId", "senderId", "clientMessageId", "body")
    VALUES ('verify-message', 'verify-conversation', 'verify-author', 'verify-client-id', 'Verification message')
  `);
  await expectDatabaseError(client, 'message_idempotency', '23505', () =>
    client.query(`
      INSERT INTO "Message" ("id", "conversationId", "senderId", "clientMessageId", "body")
      VALUES ('verify-message-duplicate', 'verify-conversation', 'verify-author', 'verify-client-id', 'Duplicate')
    `),
  );

  await client.query(`
    INSERT INTO "Notification" ("id", "userId", "type", "title")
    VALUES ('verify-notification', 'verify-author', 'VERIFICATION', 'Verification notification')
  `);
  await client.query(`
    INSERT INTO "NotificationDelivery" ("id", "notificationId", "channel", "templateVersion", "updatedAt")
    VALUES ('verify-delivery', 'verify-notification', 'EMAIL', 'v1', NOW())
  `);
  await expectDatabaseError(client, 'delivery_idempotency', '23505', () =>
    client.query(`
      INSERT INTO "NotificationDelivery" ("id", "notificationId", "channel", "templateVersion", "updatedAt")
      VALUES ('verify-delivery-duplicate', 'verify-notification', 'EMAIL', 'v1', NOW())
    `),
  );

  await client.query('ROLLBACK');
  console.log(`Database baseline verified: ${expectedTables.length} tables, ${Object.keys(expectedEnums).length} enums, critical constraints and indexes.`);
} catch (error) {
  try {
    await client.query('ROLLBACK');
  } catch {
    // The connection may not have reached a transaction.
  }
  console.error(error);
  process.exitCode = 1;
} finally {
  await client.end();
}
