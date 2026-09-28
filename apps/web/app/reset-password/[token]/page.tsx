import { AuthShell } from '../../auth/auth-shell';
import { ResetPasswordForm } from './reset-password-form';

export default async function ResetPasswordPage({
  params,
}: {
  readonly params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <AuthShell>
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
