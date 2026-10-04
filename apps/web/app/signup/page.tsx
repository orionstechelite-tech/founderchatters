import { AuthShell } from '../auth/auth-shell';
import { SignupForm } from './signup-form';

export default function SignupPage() {
  return (
    <AuthShell>
      <SignupForm />
    </AuthShell>
  );
}
