import type {
  AdminRoleKey,
  ApplicationStatus,
} from '@founderchatters/contracts';

import { E2E_PASSWORD } from '../env.js';
import {
  digestSession,
  hashPassword,
  issueRawToken,
} from '../helpers/crypto.js';
import { newId, query, queryOne } from '../helpers/db.js';
import { e2eEmail, e2eName } from '../helpers/ids.js';

export type E2eUser = {
  id: string;
  email: string;
  password: string;
  rawSession: string;
  displayName: string;
};

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

async function createSession(userId: string): Promise<string> {
  const rawToken = issueRawToken();
  await queryOne(
    `INSERT INTO "Session" (id, "userId", "tokenHash", "expiresAt")
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      newId('ses'),
      userId,
      digestSession('session-token', rawToken),
      new Date(Date.now() + SESSION_LIFETIME_MS),
    ],
  );
  return rawToken;
}

async function createBaseUser(options: {
  email: string;
  verified?: boolean;
  status?: 'ACTIVE' | 'SUSPENDED';
  onboardingCompleted?: boolean;
  suspendedUntil?: Date | null;
  suspensionReason?: string | null;
}): Promise<E2eUser> {
  const displayName = e2eName(options.email.split('@')[0] ?? 'founder');
  const user = await queryOne<{ id: string; email: string }>(
    `INSERT INTO "User" (
      id, email, "passwordHash", "emailVerifiedAt", status,
      "onboardingCompletedAt", "suspendedUntil", "suspensionReason", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    RETURNING id, email`,
    [
      newId('usr'),
      options.email,
      await hashPassword(E2E_PASSWORD),
      options.verified === false ? null : new Date(),
      options.status ?? 'ACTIVE',
      options.onboardingCompleted ? new Date() : null,
      options.suspendedUntil ?? null,
      options.suspensionReason ?? null,
    ],
  );
  return {
    id: user.id,
    email: user.email,
    password: E2E_PASSWORD,
    rawSession: await createSession(user.id),
    displayName,
  };
}

async function createApplication(
  userId: string,
  status: ApplicationStatus,
  actorUserId = userId,
): Promise<void> {
  const application = await queryOne<{ id: string }>(
    `INSERT INTO "FounderApplication" (
      id, "userId", status, "eligibilityRole", "companyName", "roleTitle",
      website, city, country, "buildingSummary", "submittedAt", "decidedAt",
      "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
    RETURNING id`,
    [
      newId('app'),
      userId,
      status,
      'FOUNDER_COFOUNDER',
      'Nexora Labs',
      'Founder',
      'https://nexora.example',
      'Bengaluru',
      'India',
      'A fictional founder-to-founder workflow tool currently in private alpha.',
      status === 'DRAFT' ? null : new Date(),
      status === 'APPROVED' || status === 'REJECTED' ? new Date() : null,
    ],
  );
  if (status !== 'DRAFT') {
    await queryOne(
      `INSERT INTO "ApplicationStatusEvent" (
        id, "applicationId", "fromStatus", "toStatus", "actorUserId", note
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [
        newId('ase'),
        application.id,
        'DRAFT',
        status,
        actorUserId,
        status === 'NEEDS_INFO'
          ? 'Please add a clearer building summary.'
          : status === 'REJECTED'
            ? 'Not currently building an eligible company.'
            : null,
      ],
    );
  }
}

async function completeProfile(user: E2eUser): Promise<void> {
  const topic = await queryOne<{ id: string }>(
    `SELECT id FROM "TaxonomyTopic" WHERE slug = 'product'`,
  );
  const profile = await queryOne<{ id: string }>(
    `INSERT INTO "FounderProfile" (
      id, "userId", "displayName", headline, bio, city, country, "currentNeedText",
      "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    RETURNING id`,
    [
      newId('prf'),
      user.id,
      user.displayName,
      'Building a fictional founder support tool',
      'E2E fixture founder.',
      'Bengaluru',
      'India',
      'Need marketplace go-to-market advice from operators.',
    ],
  );
  await queryOne(
    `INSERT INTO "Company" (
      id, "founderProfileId", name, website, description, stage, industry, city, country,
      "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
    RETURNING id`,
    [
      newId('co'),
      profile.id,
      `${user.displayName} Co`,
      'https://fixture.example',
      'Fictional E2E company.',
      'SEED',
      'SOFTWARE',
      'Bengaluru',
      'India',
    ],
  );
  await queryOne(
    `INSERT INTO "FounderExpertise" ("profileId", "topicId") VALUES ($1, $2)
     RETURNING "profileId"`,
    [profile.id, topic.id],
  );
}

export async function createUnverifiedApplicant(
  label = 'unverified',
): Promise<E2eUser> {
  return createBaseUser({
    email: e2eEmail(label),
    verified: false,
  });
}

export async function createVerifiedApplicant(
  label = 'verified',
): Promise<E2eUser> {
  return createBaseUser({
    email: e2eEmail(label),
    verified: true,
  });
}

export async function createPendingApplicant(
  label = 'pending',
): Promise<E2eUser> {
  const user = await createVerifiedApplicant(label);
  await createApplication(user.id, 'SUBMITTED');
  return user;
}

export async function createNeedsInfoApplicant(
  label = 'needs-info',
): Promise<E2eUser> {
  const user = await createVerifiedApplicant(label);
  await createApplication(user.id, 'NEEDS_INFO');
  return user;
}

export async function createRejectedApplicant(
  label = 'rejected',
): Promise<E2eUser> {
  const user = await createVerifiedApplicant(label);
  await createApplication(user.id, 'REJECTED');
  return user;
}

export async function createApprovedIncompleteFounder(
  label = 'approved',
): Promise<E2eUser> {
  const user = await createVerifiedApplicant(label);
  await createApplication(user.id, 'APPROVED');
  return user;
}

export async function createActiveFounder(label = 'active'): Promise<E2eUser> {
  const user = await createBaseUser({
    email: e2eEmail(label),
    verified: true,
    onboardingCompleted: true,
  });
  await createApplication(user.id, 'APPROVED');
  await completeProfile(user);
  return user;
}

export async function createSuspendedFounder(
  label = 'suspended',
): Promise<E2eUser> {
  const user = await createBaseUser({
    email: e2eEmail(label),
    verified: true,
    onboardingCompleted: true,
    status: 'SUSPENDED',
    suspensionReason: 'E2E fixture suspension.',
    suspendedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  await createApplication(user.id, 'APPROVED');
  await completeProfile(user);
  return user;
}

export async function assignAdminRole(
  userId: string,
  roleKey: AdminRoleKey,
): Promise<void> {
  const role = await queryOne<{ id: string }>(
    `SELECT id FROM "AdminRole" WHERE key = $1`,
    [roleKey],
  );
  await query(
    `INSERT INTO "UserAdminRole" ("userId", "roleId")
     VALUES ($1, $2)
     ON CONFLICT ("userId", "roleId") DO NOTHING`,
    [userId, role.id],
  );
}

export async function createAdminFounder(
  roleKey: AdminRoleKey,
  label = roleKey.toLowerCase(),
): Promise<E2eUser> {
  const user = await createActiveFounder(label);
  await assignAdminRole(user.id, roleKey);
  return user;
}

export async function countContributions(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM "Contribution" WHERE "contributorId" = $1`,
    [userId],
  );
  return Number(row.count);
}
