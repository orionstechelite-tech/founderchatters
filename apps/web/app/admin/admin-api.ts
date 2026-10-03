import type {
  AdminApplicationDetailResponse,
  AdminApplicationQueueResponse,
  AdminReportDetailResponse,
  AdminReportQueueResponse,
} from '@founderchatters/contracts';

interface ApiErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly fieldErrors?: Record<string, string[]>;
  };
}

export class AdminApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ??
  (process.env.NODE_ENV === 'production'
    ? 'https://api.founderchatters.com'
    : 'http://localhost:4000');

export async function adminApplicationRequest<T>(
  path = '',
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/admin/applications${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...init.headers,
      },
    });
  } catch {
    throw new AdminApiError(
      'NETWORK_ERROR',
      'We could not reach FounderChatters. Check your connection and try again.',
    );
  }

  const payload = (await response.json().catch(() => ({}))) as ApiErrorBody;
  if (!response.ok) {
    throw new AdminApiError(
      payload.error?.code ?? 'UNKNOWN_ERROR',
      payload.error?.message ?? 'Something went wrong. Please try again.',
      payload.error?.fieldErrors,
    );
  }
  return payload as T;
}

export function queueQuery(params: {
  status: string;
  country: string;
  page: number;
}): string {
  const search = new URLSearchParams({
    status: params.status,
    page: String(params.page),
  });
  if (params.country) search.set('country', params.country);
  return search.toString();
}

export function loadAdminQueue(query: string) {
  return adminApplicationRequest<AdminApplicationQueueResponse>(
    query ? `?${query}` : '',
  );
}

export function loadAdminApplication(id: string) {
  return adminApplicationRequest<AdminApplicationDetailResponse>(`/${id}`);
}

export function decideAdminApplication(
  id: string,
  action: 'needs-info' | 'approve' | 'reject',
  body?: Record<string, string>,
) {
  return adminApplicationRequest<AdminApplicationDetailResponse>(
    `/${id}/${action}`,
    {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    },
  );
}

async function adminReportRequest<T>(
  path = '',
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/admin/reports${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'content-type': 'application/json',
        ...init.headers,
      },
    });
  } catch {
    throw new AdminApiError(
      'NETWORK_ERROR',
      'We could not reach FounderChatters. Check your connection and try again.',
    );
  }
  const payload = (await response.json().catch(() => ({}))) as ApiErrorBody;
  if (!response.ok) {
    throw new AdminApiError(
      payload.error?.code ?? 'UNKNOWN_ERROR',
      payload.error?.message ?? 'Something went wrong. Please try again.',
      payload.error?.fieldErrors,
    );
  }
  return payload as T;
}

export function loadAdminReports(query = '') {
  return adminReportRequest<AdminReportQueueResponse>(query ? `?${query}` : '');
}

export function loadAdminReport(id: string) {
  return adminReportRequest<AdminReportDetailResponse>(`/${id}`);
}

export function decideAdminReport(
  id: string,
  action: 'review' | 'dismiss' | 'enforce',
) {
  return adminReportRequest<AdminReportDetailResponse>(`/${id}/${action}`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
