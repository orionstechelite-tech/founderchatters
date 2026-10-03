import type {
  AdminAnalyticsResponse,
  AdminApplicationDetailResponse,
  AdminApplicationQueueResponse,
  AdminAuditListItem,
  AdminContributionListItem,
  AdminJobFailureItem,
  AdminMemberDetail,
  AdminMemberListItem,
  AdminNotificationDeliveryItem,
  AdminNotificationTemplate,
  AdminOverviewResponse,
  AdminPage,
  AdminReportDetailResponse,
  AdminReportQueueResponse,
  AdminRequestListItem,
  AdminRoleListItem,
  AdminSearchResponse,
  AdminSessionResponse,
  AdminSettingsResponse,
  AdminSupportCaseListItem,
  AdminSupportMessage,
  AdminSystemResponse,
  AdminTaxonomyTopic,
  AdminUserListItem,
  AdminPermission,
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

export async function adminRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/admin${path}`, {
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

function adminApplicationRequest<T>(path = '', init: RequestInit = {}) {
  return adminRequest<T>(`/applications${path}`, init);
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

export function loadAdminReports(query = '') {
  return adminRequest<AdminReportQueueResponse>(
    `/reports${query ? `?${query}` : ''}`,
  );
}

export function loadAdminReport(id: string) {
  return adminRequest<AdminReportDetailResponse>(`/reports/${id}`);
}

export function decideAdminReport(
  id: string,
  action: 'review' | 'dismiss' | 'enforce',
) {
  return adminRequest<AdminReportDetailResponse>(`/reports/${id}/${action}`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function loadAdminSession() {
  return adminRequest<AdminSessionResponse>('/session');
}

export function loadAdminOverview() {
  return adminRequest<AdminOverviewResponse>('');
}

export function loadAdminMembers(query = '') {
  return adminRequest<AdminPage<AdminMemberListItem>>(
    `/members${query ? `?${query}` : ''}`,
  );
}

export function loadAdminMember(id: string) {
  return adminRequest<AdminMemberDetail>(`/members/${id}`);
}

export function suspendAdminMember(id: string, reason: string) {
  return adminRequest<AdminMemberDetail>(`/members/${id}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function restoreAdminMember(id: string) {
  return adminRequest<AdminMemberDetail>(`/members/${id}/restore`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function loadAdminRequests(page = 1) {
  return adminRequest<AdminPage<AdminRequestListItem>>(
    `/requests?page=${page}`,
  );
}

export function loadAdminRequest(id: string) {
  return adminRequest<AdminRequestListItem & { context: string }>(
    `/requests/${id}`,
  );
}

export function loadAdminSupport(page = 1) {
  return adminRequest<AdminPage<AdminSupportCaseListItem>>(
    `/support?page=${page}`,
  );
}

export function loadAdminSupportCase(id: string) {
  return adminRequest<{
    case: AdminSupportCaseListItem;
    messages: AdminSupportMessage[];
  }>(`/support/${id}`);
}

export function replyAdminSupport(id: string, body: string) {
  return adminRequest<{
    case: AdminSupportCaseListItem;
    messages: AdminSupportMessage[];
  }>(`/support/${id}/reply`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export function statusAdminSupport(id: string, status: string) {
  return adminRequest<{
    case: AdminSupportCaseListItem;
    messages: AdminSupportMessage[];
  }>(`/support/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export function loadAdminReputation(page = 1) {
  return adminRequest<AdminPage<AdminContributionListItem>>(
    `/reputation?page=${page}`,
  );
}

export function loadAdminContribution(id: string) {
  return adminRequest<AdminContributionListItem>(`/reputation/${id}`);
}

export function loadAdminNotifications(page = 1) {
  return adminRequest<AdminPage<AdminNotificationDeliveryItem>>(
    `/notifications?page=${page}`,
  );
}

export function loadAdminNotification(id: string) {
  return adminRequest<AdminNotificationDeliveryItem>(`/notifications/${id}`);
}

export function retryAdminNotification(id: string) {
  return adminRequest<AdminNotificationDeliveryItem>(
    `/notifications/${id}/retry`,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function loadAdminTemplates() {
  return adminRequest<{ templates: AdminNotificationTemplate[] }>(
    '/notifications/templates',
  );
}

export function loadAdminTemplate(id: string) {
  return adminRequest<AdminNotificationTemplate>(
    `/notifications/templates/${id}`,
  );
}

export function loadAdminTaxonomy() {
  return adminRequest<{ topics: AdminTaxonomyTopic[] }>('/taxonomy');
}

export function createAdminTopic(label: string, description: string | null) {
  return adminRequest<{ topic: AdminTaxonomyTopic }>('/taxonomy', {
    method: 'POST',
    body: JSON.stringify({ label, description }),
  });
}

export function patchAdminTopic(
  id: string,
  body: { label?: string; description?: string | null; isActive?: boolean },
) {
  return adminRequest<{ topic: AdminTaxonomyTopic }>(`/taxonomy/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function mergeAdminTopic(id: string, targetId: string) {
  return adminRequest<{ topic: AdminTaxonomyTopic }>(`/taxonomy/${id}/merge`, {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export function loadAdminAnalytics() {
  return adminRequest<AdminAnalyticsResponse>('/analytics');
}

export function loadAdminUsers(page = 1) {
  return adminRequest<AdminPage<AdminUserListItem>>(`/admins?page=${page}`);
}

export function loadAdminUser(id: string) {
  return adminRequest<AdminUserListItem>(`/admins/${id}`);
}

export function replaceAdminRoles(id: string, roles: string[]) {
  return adminRequest<AdminUserListItem>(`/admins/${id}/roles`, {
    method: 'PUT',
    body: JSON.stringify({ roles }),
  });
}

export function disableAdminUser(id: string) {
  return adminRequest<{ disabled: true }>(`/admins/${id}/disable`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function revokeAdminSessions(id: string) {
  return adminRequest<{ revokedCount: number }>(`/admins/${id}/sessions`, {
    method: 'DELETE',
    body: JSON.stringify({}),
  });
}

export function loadAdminRoles() {
  return adminRequest<{ roles: AdminRoleListItem[] }>('/roles');
}

export function loadAdminAudit(query = '') {
  return adminRequest<AdminPage<AdminAuditListItem>>(
    `/audit${query ? `?${query}` : ''}`,
  );
}

export function loadAdminAuditEntry(id: string) {
  return adminRequest<AdminAuditListItem & { metadata: unknown }>(
    `/audit/${id}`,
  );
}

export function loadAdminSettings() {
  return adminRequest<AdminSettingsResponse>('/settings');
}

export function loadAdminSystem() {
  return adminRequest<AdminSystemResponse>('/system');
}

export function loadAdminJobs(page = 1) {
  return adminRequest<AdminPage<AdminJobFailureItem>>(
    `/system/jobs?page=${page}`,
  );
}

export function loadAdminJob(id: string) {
  return adminRequest<AdminJobFailureItem>(`/system/jobs/${id}`);
}

export function retryAdminJob(id: string) {
  return adminRequest<AdminJobFailureItem>(`/system/jobs/${id}/retry`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function searchAdmin(q: string) {
  return adminRequest<AdminSearchResponse>(
    `/search?q=${encodeURIComponent(q)}`,
  );
}

export function hasPermission(
  permissions: readonly string[] | undefined,
  key: AdminPermission,
): boolean {
  return Boolean(permissions?.includes(key));
}
