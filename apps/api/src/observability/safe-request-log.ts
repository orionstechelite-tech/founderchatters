import { ApiError } from '../http/api-error.js';

export type SafeRequestLog = {
  service: 'api';
  environment: string;
  requestId: string;
  route: string;
  status: number;
  latencyMs: number;
  errorCode?: string;
  actorUserId?: string;
};

const SAFE_ACTOR_ID = /^[A-Za-z0-9._-]{1,128}$/;

const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|cookie|authorization|api[_-]?key|pepper|dsn|private)/i;

export function sanitizeRequestPath(path: string): string {
  const [pathname] = path.split('?');
  return pathname && pathname.length > 0 ? pathname : '/';
}

export function safeActorUserId(value: unknown): string | undefined {
  return typeof value === 'string' && SAFE_ACTOR_ID.test(value)
    ? value
    : undefined;
}

export function safeErrorCode(error: unknown): string | undefined {
  if (error instanceof ApiError) {
    return error.code;
  }
  return undefined;
}

export function buildSafeRequestLog(input: {
  environment: string;
  requestId: string;
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  error?: unknown;
  errorCode?: string;
  actorUserId?: unknown;
}): SafeRequestLog {
  const log: SafeRequestLog = {
    service: 'api',
    environment: input.environment,
    requestId: input.requestId,
    route: `${input.method.toUpperCase()} ${sanitizeRequestPath(input.path)}`,
    status: input.status,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
  };
  const errorCode = input.errorCode ?? safeErrorCode(input.error);
  if (errorCode) {
    log.errorCode = errorCode;
  }
  const actorUserId = safeActorUserId(input.actorUserId);
  if (actorUserId) {
    log.actorUserId = actorUserId;
  }
  return log;
}

export function requestLogLeaksSensitiveData(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return (
      value.includes('postgresql://') ||
      value.includes('redis://') ||
      /bearer\s+/i.test(value)
    );
  }
  if (typeof value !== 'object') {
    return false;
  }
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return true;
      }
      return requestLogLeaksSensitiveData(nested);
    },
  );
}
