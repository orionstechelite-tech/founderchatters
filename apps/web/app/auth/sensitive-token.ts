const VERIFY_TOKEN_KEY = 'fc.auth.verify-token';
const RESET_TOKEN_KEY = 'fc.auth.reset-token';
const RESET_SAFE_PATH = '/reset-password/recover';

export function captureVerificationToken(
  token: string | undefined,
): string | undefined {
  if (typeof window === 'undefined') return token;
  if (token) {
    window.sessionStorage.setItem(VERIFY_TOKEN_KEY, token);
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname,
    );
    return token;
  }
  return window.sessionStorage.getItem(VERIFY_TOKEN_KEY) ?? undefined;
}

export function clearVerificationToken(): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(VERIFY_TOKEN_KEY);
  }
}

export function capturePasswordResetToken(token: string): string | undefined {
  if (typeof window === 'undefined') return token;
  if (token !== 'recover') {
    window.sessionStorage.setItem(RESET_TOKEN_KEY, token);
    window.history.replaceState(window.history.state, '', RESET_SAFE_PATH);
    return token;
  }
  return window.sessionStorage.getItem(RESET_TOKEN_KEY) ?? undefined;
}

export function clearPasswordResetToken(): void {
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(RESET_TOKEN_KEY);
  }
}
