import { randomBytes } from 'node:crypto';

export const DELETED_FOUNDER_DISPLAY_NAME = 'Deleted founder';
export const DELETED_COMPANY_NAME = 'Deleted account';
export const DELETED_EMAIL_DOMAIN = 'deleted.invalid';

export function isDeletedAccount(user: {
  status?: string | null;
  deletedAt?: Date | null;
}): boolean {
  return user.status === 'DELETED' || Boolean(user.deletedAt);
}

export function deletedFounderSummary(userId: string): {
  id: string;
  displayName: string;
  avatarUrl: null;
  companyName: string;
  city: null;
  country: null;
} {
  return {
    id: userId,
    displayName: DELETED_FOUNDER_DISPLAY_NAME,
    avatarUrl: null,
    companyName: DELETED_COMPANY_NAME,
    city: null,
    country: null,
  };
}

export function newTombstoneEmail(): string {
  return `deleted-${randomBytes(16).toString('hex')}@${DELETED_EMAIL_DOMAIN}`;
}

export function isTombstoneEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${DELETED_EMAIL_DOMAIN}`);
}
