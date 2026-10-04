import { AuthShell } from '../auth/auth-shell';
import { SigninForm } from './signin-form';

export default function SigninPage() {
  return (
    <AuthShell>
      <SigninForm />
    </AuthShell>
  );
}
