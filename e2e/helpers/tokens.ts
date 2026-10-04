import { E2E_WEB_ORIGIN } from '../env.js';
import { hashAuthToken, issueRawToken } from './crypto.js';
import { newId, queryOne } from './db.js';

export async function issueVerificationUrl(userId: string): Promise<string> {
  const rawToken = issueRawToken();
  await queryOne(
    `INSERT INTO "EmailVerificationToken" (id, "userId", "tokenHash", "expiresAt")
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      newId('tok'),
      userId,
      hashAuthToken('email-verification', rawToken),
      new Date(Date.now() + 30 * 60 * 1000),
    ],
  );
  return `${E2E_WEB_ORIGIN}/verify-email?token=${rawToken}`;
}

export async function issueResetUrl(
  userId: string,
  ttlMs = 30 * 60 * 1000,
): Promise<string> {
  const rawToken = issueRawToken();
  await queryOne(
    `INSERT INTO "PasswordResetToken" (id, "userId", "tokenHash", "expiresAt")
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [
      newId('rst'),
      userId,
      hashAuthToken('password-reset', rawToken),
      new Date(Date.now() + ttlMs),
    ],
  );
  return `${E2E_WEB_ORIGIN}/reset-password/${rawToken}`;
}

export async function issueExpiredResetUrl(userId: string): Promise<string> {
  const rawToken = issueRawToken();
  await queryOne(
    `INSERT INTO "PasswordResetToken" (id, "userId", "tokenHash", "expiresAt")
     VALUES ($1, $2, $3, NOW() - INTERVAL '2 hours')
     RETURNING id`,
    [newId('rst'), userId, hashAuthToken('password-reset', rawToken)],
  );
  return `${E2E_WEB_ORIGIN}/reset-password/${rawToken}`;
}

export async function findUserIdByEmail(email: string): Promise<string> {
  const user = await queryOne<{ id: string }>(
    `SELECT id FROM "User" WHERE email = $1`,
    [email.trim().toLowerCase()],
  );
  return user.id;
}
