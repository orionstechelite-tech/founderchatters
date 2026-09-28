import { AuthShell } from '../auth/auth-shell';
import { VerifyEmailClient } from './verify-email-client';

export default async function VerifyEmailPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ token?: string | string[] }>;
}) {
  const query = await searchParams;
  const token = typeof query.token === 'string' ? query.token : undefined;

  return (
    <AuthShell>
      <VerifyEmailClient token={token} />
    </AuthShell>
  );
}
