'use client';

import {
  ADMIN_PERMISSIONS,
  SUPPORT_CASE_STATUSES,
} from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import Link from 'next/link';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

import {
  AdminApiError,
  createAdminTopic,
  disableAdminUser,
  hasPermission,
  loadAdminAnalytics,
  loadAdminAudit,
  loadAdminAuditEntry,
  loadAdminContribution,
  loadAdminJob,
  loadAdminJobs,
  loadAdminMember,
  loadAdminMembers,
  loadAdminNotification,
  loadAdminNotifications,
  loadAdminOverview,
  loadAdminReputation,
  loadAdminRequest,
  loadAdminRequests,
  loadAdminRoles,
  loadAdminSession,
  loadAdminSettings,
  loadAdminSupport,
  loadAdminSupportCase,
  loadAdminSystem,
  loadAdminTaxonomy,
  loadAdminTemplate,
  loadAdminTemplates,
  loadAdminUser,
  loadAdminUsers,
  mergeAdminTopic,
  patchAdminTopic,
  replyAdminSupport,
  replaceAdminRoles,
  restoreAdminMember,
  retryAdminJob,
  retryAdminNotification,
  revokeAdminSessions,
  searchAdmin,
  statusAdminSupport,
  suspendAdminMember,
} from './admin-api';

function useResource<T>(
  loader: () => Promise<T>,
  refreshKey: string | number = 0,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loader()
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setError(null);
        setLoading(false);
      })
      .catch((caught) => {
        if (cancelled) return;
        setData(null);
        setError(
          caught instanceof AdminApiError
            ? caught.message
            : 'Something went wrong. Please try again.',
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // loader is recreated each render; refreshKey is the intentional trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  return { data, error, loading, setData };
}

function Page({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="fc-admin-page">
      <header className="fc-admin-page__header">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

function Status({ children }: { children: ReactNode }) {
  return (
    <p className="fc-admin-status" role="status">
      {children}
    </p>
  );
}

function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="fc-admin-pager">
      <Button
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        variant="secondary"
      >
        Previous
      </Button>
      <span>
        Page {page} of {totalPages}
      </span>
      <Button
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        variant="secondary"
      >
        Next
      </Button>
    </div>
  );
}

export function OverviewScreen() {
  const loader = loadAdminOverview;
  const { data, error, loading } = useResource(loader);
  if (loading)
    return (
      <Page title="Command Center">
        <Status>Loading…</Status>
      </Page>
    );
  if (error)
    return (
      <Page title="Command Center">
        <Status>{error}</Status>
      </Page>
    );
  const metrics = data?.metrics;
  return (
    <Page
      title="Command Center"
      description="Operational counts from persisted FounderChatters records."
    >
      <div className="fc-admin-metrics">
        <Metric
          href="/admin/applications"
          kicker="Submitted applications"
          value={metrics?.submittedApplications ?? 0}
        />
        <Metric
          href="/admin/reports"
          kicker="Open reports"
          value={metrics?.openReports ?? 0}
        />
        <Metric
          href="/admin/requests"
          kicker="Published requests"
          value={metrics?.publishedRequests ?? 0}
        />
        <Metric
          href="/admin/support"
          kicker="Open support cases"
          value={metrics?.openSupportCases ?? 0}
        />
        <Metric
          href="/admin/notifications"
          kicker="Queued deliveries"
          value={metrics?.queuedNotificationDeliveries ?? 0}
        />
        <Metric
          href="/admin/system/jobs"
          kicker="Unresolved job failures"
          value={metrics?.unresolvedJobFailures ?? 0}
        />
      </div>
    </Page>
  );
}

function Metric({
  href,
  kicker,
  value,
}: {
  href: string;
  kicker: string;
  value: number;
}) {
  return (
    <a className="fc-admin-metric" href={href}>
      <p className="fc-admin-metric__kicker">{kicker}</p>
      <p className="fc-admin-metric__value">{value}</p>
    </a>
  );
}

export function MembersScreen() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const loader = () => {
    const params = new URLSearchParams({ page: String(page) });
    if (status) params.set('status', status);
    if (q.length >= 2) params.set('q', q);
    return loadAdminMembers(params.toString());
  };
  const { data, error, loading } = useResource(
    loader,
    `${page}|${status}|${q}`,
  );
  return (
    <Page
      title="Members"
      description="Founder accounts, including deleted tombstones."
    >
      <div className="fc-admin-filters">
        <label>
          Status
          <select
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
            value={status}
          >
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DELETED">Deleted</option>
          </select>
        </label>
        <label>
          Search
          <input
            onChange={(event) => {
              setPage(1);
              setQ(event.target.value);
            }}
            placeholder="Name, email, company"
            value={q}
          />
        </label>
      </div>
      {loading ? <Status>Loading…</Status> : null}
      {error ? <Status>{error}</Status> : null}
      {!loading && data && data.items.length === 0 ? (
        <Status>
          {q || status ? 'No members match those filters.' : 'No members yet.'}
        </Status>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="fc-admin-table-wrap">
          <table className="fc-admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Company</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <a href={`/admin/members/${item.id}`}>{item.displayName}</a>
                  </td>
                  <td>{item.email ?? '—'}</td>
                  <td>{item.deleted ? 'DELETED' : item.status}</td>
                  <td>{item.companyName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager
            onPage={setPage}
            page={data.page}
            totalPages={data.totalPages}
          />
        </div>
      ) : null}
    </Page>
  );
}

export function MemberDetailScreen({ id }: { id: string }) {
  const [refresh, setRefresh] = useState(0);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const { data, error, loading } = useResource(
    () => loadAdminMember(id),
    refresh,
  );
  useEffect(() => {
    loadAdminSession()
      .then((session) => setPermissions(session.permissions))
      .catch(() => undefined);
  }, []);
  async function onSuspend(event: FormEvent) {
    event.preventDefault();
    try {
      await suspendAdminMember(id, reason);
      setMessage('Member suspended.');
      setRefresh((value) => value + 1);
    } catch (caught) {
      setMessage(
        caught instanceof AdminApiError ? caught.message : 'Could not suspend.',
      );
    }
  }
  async function onRestore() {
    try {
      await restoreAdminMember(id);
      setMessage('Member restored.');
      setRefresh((value) => value + 1);
    } catch (caught) {
      setMessage(
        caught instanceof AdminApiError ? caught.message : 'Could not restore.',
      );
    }
  }
  if (loading)
    return (
      <Page title="Founder 360">
        <Status>Loading…</Status>
      </Page>
    );
  if (error || !data)
    return (
      <Page title="Founder 360">
        <Status>{error ?? 'Not found.'}</Status>
      </Page>
    );
  return (
    <Page
      title={data.displayName}
      description="Account, request, and safety metadata. Private messages are not listed."
    >
      <dl className="fc-admin-dl">
        <div>
          <dt>Status</dt>
          <dd>{data.deleted ? 'DELETED' : data.status}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{data.email ?? '—'}</dd>
        </div>
        <div>
          <dt>Company</dt>
          <dd>{data.companyName ?? '—'}</dd>
        </div>
        <div>
          <dt>Requests</dt>
          <dd>{data.requestCount}</dd>
        </div>
        <div>
          <dt>Responses</dt>
          <dd>{data.responseCount}</dd>
        </div>
        <div>
          <dt>Reports</dt>
          <dd>{data.reportCount}</dd>
        </div>
        <div>
          <dt>Contributions received</dt>
          <dd>{data.contributionCount}</dd>
        </div>
      </dl>
      {message ? <Status>{message}</Status> : null}
      {!data.deleted &&
      data.status === 'ACTIVE' &&
      hasPermission(permissions, ADMIN_PERMISSIONS.membersSuspend) ? (
        <form className="fc-admin-form" onSubmit={onSuspend}>
          <Field
            label="Suspension reason"
            onChange={(event) => setReason(event.target.value)}
            required
            value={reason}
          />
          <Button type="submit">Suspend member</Button>
        </form>
      ) : null}
      {!data.deleted &&
      data.status === 'SUSPENDED' &&
      hasPermission(permissions, ADMIN_PERMISSIONS.membersRestore) ? (
        <Button onClick={onRestore}>Restore member</Button>
      ) : null}
    </Page>
  );
}

export function RequestsScreen() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useResource(
    () => loadAdminRequests(page),
    page,
  );
  return (
    <Page
      title="Requests"
      description="Read-only request inspection. Safety enforcement stays on the report queue."
    >
      {loading ? <Status>Loading…</Status> : null}
      {error ? <Status>{error}</Status> : null}
      {data && data.items.length === 0 ? (
        <Status>No requests yet.</Status>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="fc-admin-table-wrap">
          <table className="fc-admin-table">
            <thead>
              <tr>
                <th>Headline</th>
                <th>Status</th>
                <th>Author</th>
                <th>Responses</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <a href={`/admin/requests/${item.id}`}>{item.headline}</a>
                  </td>
                  <td>{item.status}</td>
                  <td>{item.authorDisplayName}</td>
                  <td>{item.responseCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager
            onPage={setPage}
            page={data.page}
            totalPages={data.totalPages}
          />
        </div>
      ) : null}
    </Page>
  );
}

export function RequestDetailScreen({ id }: { id: string }) {
  const { data, error, loading } = useResource(() => loadAdminRequest(id));
  if (loading)
    return (
      <Page title="Request">
        <Status>Loading…</Status>
      </Page>
    );
  if (error || !data)
    return (
      <Page title="Request">
        <Status>{error ?? 'Not found.'}</Status>
      </Page>
    );
  return (
    <Page
      title={data.headline}
      description="Request record only. Related private messages are not available here."
    >
      <dl className="fc-admin-dl">
        <div>
          <dt>Status</dt>
          <dd>{data.status}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{data.type}</dd>
        </div>
        <div>
          <dt>Author</dt>
          <dd>{data.authorDisplayName}</dd>
        </div>
        <div>
          <dt>Responses</dt>
          <dd>{data.responseCount}</dd>
        </div>
      </dl>
      <p className="fc-admin-body">{data.context}</p>
    </Page>
  );
}

export function SupportScreen() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useResource(
    () => loadAdminSupport(page),
    page,
  );
  return (
    <Page
      title="Support & Appeals"
      description="Operational support cases. Appeal adjudication is not available in this release."
    >
      {loading ? <Status>Loading…</Status> : null}
      {error ? <Status>{error}</Status> : null}
      {data && data.items.length === 0 ? (
        <Status>No support cases yet.</Status>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="fc-admin-table-wrap">
          <table className="fc-admin-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Status</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <a href={`/admin/support/${item.id}`}>{item.subject}</a>
                  </td>
                  <td>{item.status}</td>
                  <td>{item.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager
            onPage={setPage}
            page={data.page}
            totalPages={data.totalPages}
          />
        </div>
      ) : null}
    </Page>
  );
}

export function SupportDetailScreen({ id }: { id: string }) {
  const [refresh, setRefresh] = useState(0);
  const [body, setBody] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const { data, error, loading } = useResource(
    () => loadAdminSupportCase(id),
    refresh,
  );
  useEffect(() => {
    loadAdminSession()
      .then((session) => setPermissions(session.permissions))
      .catch(() => undefined);
  }, []);
  if (loading)
    return (
      <Page title="Support case">
        <Status>Loading…</Status>
      </Page>
    );
  if (error || !data)
    return (
      <Page title="Support case">
        <Status>{error ?? 'Not found.'}</Status>
      </Page>
    );
  async function onReply(event: FormEvent) {
    event.preventDefault();
    try {
      await replyAdminSupport(id, body);
      setBody('');
      setMessage('Reply sent.');
      setRefresh((value) => value + 1);
    } catch (caught) {
      setMessage(
        caught instanceof AdminApiError ? caught.message : 'Could not reply.',
      );
    }
  }
  async function onStatus(status: string) {
    try {
      await statusAdminSupport(id, status);
      setRefresh((value) => value + 1);
    } catch (caught) {
      setMessage(
        caught instanceof AdminApiError
          ? caught.message
          : 'Could not update status.',
      );
    }
  }
  return (
    <Page title={data.case.subject} description={`Status: ${data.case.status}`}>
      <ol className="fc-admin-thread">
        {data.messages.map((item) => (
          <li key={item.id}>
            <strong>{item.actorType}</strong>
            <p>{item.body}</p>
          </li>
        ))}
      </ol>
      {message ? <Status>{message}</Status> : null}
      {hasPermission(permissions, ADMIN_PERMISSIONS.supportReply) ? (
        <form className="fc-admin-form" onSubmit={onReply}>
          <Field
            fieldType="textarea"
            label="Reply"
            onChange={(event) => setBody(event.target.value)}
            required
            value={body}
          />
          <Button type="submit">Send reply</Button>
        </form>
      ) : null}
      {hasPermission(permissions, ADMIN_PERMISSIONS.supportStatus) ? (
        <div className="fc-admin-actions">
          {SUPPORT_CASE_STATUSES.filter(
            (status) => status !== data.case.status,
          ).map((status) => (
            <Button
              key={status}
              onClick={() => onStatus(status)}
              variant="secondary"
            >
              Mark {status.replaceAll('_', ' ').toLowerCase()}
            </Button>
          ))}
        </div>
      ) : null}
    </Page>
  );
}

export function ReputationScreen() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useResource(
    () => loadAdminReputation(page),
    page,
  );
  return (
    <Page
      title="Reputation"
      description="HELPED-derived contributions. Scores cannot be edited."
    >
      {loading ? <Status>Loading…</Status> : null}
      {error ? <Status>{error}</Status> : null}
      {data && data.items.length === 0 ? (
        <Status>No contributions yet.</Status>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="fc-admin-table-wrap">
          <table className="fc-admin-table">
            <thead>
              <tr>
                <th>Helper</th>
                <th>Request</th>
                <th>Thank-you</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <a href={`/admin/reputation/${item.id}`}>
                      {item.helperDisplayName}
                    </a>
                  </td>
                  <td>{item.requestId}</td>
                  <td>{item.hasThankYou ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager
            onPage={setPage}
            page={data.page}
            totalPages={data.totalPages}
          />
        </div>
      ) : null}
    </Page>
  );
}

export function ReputationDetailScreen({ id }: { id: string }) {
  const { data, error, loading } = useResource(() => loadAdminContribution(id));
  if (loading)
    return (
      <Page title="Contribution">
        <Status>Loading…</Status>
      </Page>
    );
  if (error || !data)
    return (
      <Page title="Contribution">
        <Status>{error ?? 'Not found.'}</Status>
      </Page>
    );
  return (
    <Page
      title="Contribution"
      description="Read-only source-backed contribution."
    >
      <dl className="fc-admin-dl">
        <div>
          <dt>Helper</dt>
          <dd>{data.helperDisplayName}</dd>
        </div>
        <div>
          <dt>Request</dt>
          <dd>{data.requestId}</dd>
        </div>
        <div>
          <dt>Thank-you present</dt>
          <dd>{data.hasThankYou ? 'Yes' : 'No'}</dd>
        </div>
      </dl>
    </Page>
  );
}

export function NotificationsScreen() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useResource(
    () => loadAdminNotifications(page),
    page,
  );
  return (
    <Page
      title="Notifications"
      description="Delivery records. Templates are read-only."
    >
      <p>
        <Link href="/admin/notifications/templates">View templates</Link>
      </p>
      {loading ? <Status>Loading…</Status> : null}
      {error ? <Status>{error}</Status> : null}
      {data && data.items.length === 0 ? (
        <Status>No deliveries yet.</Status>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="fc-admin-table-wrap">
          <table className="fc-admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Channel</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <a href={`/admin/notifications/${item.id}`}>{item.title}</a>
                  </td>
                  <td>{item.status}</td>
                  <td>{item.channel}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager
            onPage={setPage}
            page={data.page}
            totalPages={data.totalPages}
          />
        </div>
      ) : null}
    </Page>
  );
}

export function NotificationDetailScreen({ id }: { id: string }) {
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const { data, error, loading } = useResource(
    () => loadAdminNotification(id),
    refresh,
  );
  useEffect(() => {
    loadAdminSession()
      .then((session) => setPermissions(session.permissions))
      .catch(() => undefined);
  }, []);
  if (loading)
    return (
      <Page title="Delivery">
        <Status>Loading…</Status>
      </Page>
    );
  if (error || !data)
    return (
      <Page title="Delivery">
        <Status>{error ?? 'Not found.'}</Status>
      </Page>
    );
  async function onRetry() {
    try {
      await retryAdminNotification(id);
      setMessage('Delivery re-queued.');
      setRefresh((value) => value + 1);
    } catch (caught) {
      setMessage(
        caught instanceof AdminApiError ? caught.message : 'Could not retry.',
      );
    }
  }
  return (
    <Page title={data.title}>
      <dl className="fc-admin-dl">
        <div>
          <dt>Status</dt>
          <dd>{data.status}</dd>
        </div>
        <div>
          <dt>Channel</dt>
          <dd>{data.channel}</dd>
        </div>
        <div>
          <dt>Attempts</dt>
          <dd>{data.attemptCount}</dd>
        </div>
        <div>
          <dt>Error</dt>
          <dd>{data.lastErrorCode ?? '—'}</dd>
        </div>
      </dl>
      {message ? <Status>{message}</Status> : null}
      {data.status !== 'SENT' &&
      hasPermission(permissions, ADMIN_PERMISSIONS.notificationsRetry) ? (
        <Button onClick={onRetry}>Retry delivery</Button>
      ) : null}
    </Page>
  );
}

export function TemplatesScreen() {
  const { data, error, loading } = useResource(loadAdminTemplates);
  return (
    <Page
      title="Notification templates"
      description="Read-only template versions. Editing is not available."
    >
      {loading ? <Status>Loading…</Status> : null}
      {error ? <Status>{error}</Status> : null}
      {data && data.templates.length === 0 ? (
        <Status>No templates yet.</Status>
      ) : null}
      {data ? (
        <ul className="fc-admin-list">
          {data.templates.map((item) => (
            <li key={item.id}>
              <a href={`/admin/notifications/templates/${item.id}`}>
                {item.key} · {item.version}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </Page>
  );
}

export function TemplateDetailScreen({ id }: { id: string }) {
  const { data, error, loading } = useResource(() => loadAdminTemplate(id));
  if (loading)
    return (
      <Page title="Template">
        <Status>Loading…</Status>
      </Page>
    );
  if (error || !data)
    return (
      <Page title="Template">
        <Status>{error ?? 'Not found.'}</Status>
      </Page>
    );
  return (
    <Page title={data.key} description="Read-only template record.">
      <dl className="fc-admin-dl">
        <div>
          <dt>Version</dt>
          <dd>{data.version}</dd>
        </div>
        <div>
          <dt>Subject</dt>
          <dd>{data.subject ?? '—'}</dd>
        </div>
        <div>
          <dt>Active</dt>
          <dd>{data.isActive ? 'Yes' : 'No'}</dd>
        </div>
      </dl>
    </Page>
  );
}

export function TaxonomyScreen() {
  const [refresh, setRefresh] = useState(0);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [mergeTarget, setMergeTarget] = useState<Record<string, string>>({});
  const { data, error, loading } = useResource(loadAdminTaxonomy, refresh);
  useEffect(() => {
    loadAdminSession()
      .then((session) => setPermissions(session.permissions))
      .catch(() => undefined);
  }, []);
  const canManage = hasPermission(
    permissions,
    ADMIN_PERMISSIONS.taxonomyManage,
  );
  async function onCreate(event: FormEvent) {
    event.preventDefault();
    try {
      await createAdminTopic(label, description || null);
      setLabel('');
      setDescription('');
      setMessage('Topic created.');
      setRefresh((value) => value + 1);
    } catch (caught) {
      setMessage(
        caught instanceof AdminApiError ? caught.message : 'Could not create.',
      );
    }
  }
  return (
    <Page
      title="Taxonomy"
      description="Stable topic IDs. Merge does not rewrite historical contribution or request topic IDs."
    >
      {loading ? <Status>Loading…</Status> : null}
      {error ? <Status>{error}</Status> : null}
      {message ? <Status>{message}</Status> : null}
      {canManage ? (
        <form className="fc-admin-form" onSubmit={onCreate}>
          <Field
            label="Label"
            onChange={(event) => setLabel(event.target.value)}
            required
            value={label}
          />
          <Field
            label="Description"
            onChange={(event) => setDescription(event.target.value)}
            value={description}
          />
          <Button type="submit">Add topic</Button>
        </form>
      ) : null}
      {data && data.topics.length === 0 ? (
        <Status>No topics yet.</Status>
      ) : null}
      {data ? (
        <ul className="fc-admin-list">
          {data.topics.map((topic) => (
            <li key={topic.id}>
              <strong>{topic.label}</strong> · {topic.slug} ·{' '}
              {topic.isActive ? 'Active' : 'Inactive'}
              {topic.mergedIntoId ? ` · merged` : ''}
              {canManage && topic.isActive && !topic.mergedIntoId ? (
                <span className="fc-admin-inline">
                  <Button
                    onClick={async () => {
                      await patchAdminTopic(topic.id, { isActive: false });
                      setRefresh((value) => value + 1);
                    }}
                    variant="secondary"
                  >
                    Deactivate
                  </Button>
                  <input
                    aria-label={`Merge ${topic.label} into`}
                    onChange={(event) =>
                      setMergeTarget((current) => ({
                        ...current,
                        [topic.id]: event.target.value,
                      }))
                    }
                    placeholder="Target topic ID"
                    value={mergeTarget[topic.id] ?? ''}
                  />
                  <Button
                    onClick={async () => {
                      const targetId = mergeTarget[topic.id];
                      if (!targetId) return;
                      try {
                        await mergeAdminTopic(topic.id, targetId);
                        setRefresh((value) => value + 1);
                      } catch (caught) {
                        setMessage(
                          caught instanceof AdminApiError
                            ? caught.message
                            : 'Could not merge.',
                        );
                      }
                    }}
                    variant="secondary"
                  >
                    Merge
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Page>
  );
}

export function AnalyticsScreen() {
  const { data, error, loading } = useResource(loadAdminAnalytics);
  if (loading)
    return (
      <Page title="Analytics">
        <Status>Loading…</Status>
      </Page>
    );
  if (error || !data)
    return (
      <Page title="Analytics">
        <Status>{error ?? 'Unavailable.'}</Status>
      </Page>
    );
  return (
    <Page
      title="Analytics"
      description="Counts derived from persisted records only."
    >
      <div className="fc-admin-metrics">
        <Metric
          href="/admin/requests"
          kicker="Published requests"
          value={data.publishedRequests}
        />
        <Metric
          href="/admin/requests"
          kicker="Requests with a response"
          value={data.requestsWithResponse}
        />
        <Metric
          href="/admin/reputation"
          kicker="Confirmed helped"
          value={data.confirmedHelped}
        />
        <Metric
          href="/admin/reputation"
          kicker="Active helpers"
          value={data.activeHelpers}
        />
        <Metric
          href="/admin/requests"
          kicker="No-response requests"
          value={data.requestsWithNoResponse}
        />
        <Metric
          href="/admin/applications"
          kicker="Submitted applications"
          value={data.submittedApplications}
        />
      </div>
    </Page>
  );
}

export function AdminsScreen() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useResource(
    () => loadAdminUsers(page),
    page,
  );
  return (
    <Page title="Admins & Roles">
      <p>
        <a href="/admin/roles">View predefined roles</a>
      </p>
      {loading ? <Status>Loading…</Status> : null}
      {error ? <Status>{error}</Status> : null}
      {data && data.items.length === 0 ? (
        <Status>No admin users yet.</Status>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="fc-admin-table-wrap">
          <table className="fc-admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <a href={`/admin/admins/${item.id}`}>{item.displayName}</a>
                  </td>
                  <td>{item.email}</td>
                  <td>{item.roles.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager
            onPage={setPage}
            page={data.page}
            totalPages={data.totalPages}
          />
        </div>
      ) : null}
    </Page>
  );
}

export function AdminUserDetailScreen({ id }: { id: string }) {
  const [refresh, setRefresh] = useState(0);
  const [rolesOverride, setRolesOverride] = useState<string[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const { data, error, loading } = useResource(
    () => loadAdminUser(id),
    refresh,
  );
  const catalog = useResource(loadAdminRoles);
  const roles = rolesOverride ?? data?.roles ?? [];
  useEffect(() => {
    loadAdminSession()
      .then((session) => setPermissions(session.permissions))
      .catch(() => undefined);
  }, []);
  if (loading)
    return (
      <Page title="Admin user">
        <Status>Loading…</Status>
      </Page>
    );
  if (error || !data)
    return (
      <Page title="Admin user">
        <Status>{error ?? 'Not found.'}</Status>
      </Page>
    );
  const canManage = hasPermission(permissions, ADMIN_PERMISSIONS.adminsManage);
  return (
    <Page title={data.displayName}>
      <p>{data.email}</p>
      {canManage ? (
        <form
          className="fc-admin-form"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              await replaceAdminRoles(id, roles);
              setMessage('Roles updated.');
              setRefresh((value) => value + 1);
            } catch (caught) {
              setMessage(
                caught instanceof AdminApiError
                  ? caught.message
                  : 'Could not update roles.',
              );
            }
          }}
        >
          <fieldset>
            <legend>Roles</legend>
            {catalog.data?.roles.map((role) => (
              <label key={role.key}>
                <input
                  checked={roles.includes(role.key)}
                  onChange={(event) => {
                    setRolesOverride((current) => {
                      const selected = current ?? data.roles;
                      return event.target.checked
                        ? [...selected, role.key]
                        : selected.filter((key) => key !== role.key);
                    });
                  }}
                  type="checkbox"
                />
                {role.name}
              </label>
            ))}
          </fieldset>
          <Button type="submit">Replace roles</Button>
        </form>
      ) : (
        <p>{data.roles.join(', ')}</p>
      )}
      {message ? <Status>{message}</Status> : null}
      {canManage ? (
        <div className="fc-admin-actions">
          <Button
            onClick={async () => {
              try {
                await revokeAdminSessions(id);
                setMessage('Sessions revoked.');
              } catch (caught) {
                setMessage(
                  caught instanceof AdminApiError
                    ? caught.message
                    : 'Could not revoke.',
                );
              }
            }}
            variant="secondary"
          >
            Revoke sessions
          </Button>
          <Button
            onClick={async () => {
              try {
                await disableAdminUser(id);
                setMessage('Admin access removed.');
                setRefresh((value) => value + 1);
              } catch (caught) {
                setMessage(
                  caught instanceof AdminApiError
                    ? caught.message
                    : 'Could not disable.',
                );
              }
            }}
            variant="secondary"
          >
            Disable admin access
          </Button>
        </div>
      ) : null}
    </Page>
  );
}

export function RolesScreen() {
  const { data, error, loading } = useResource(loadAdminRoles);
  return (
    <Page
      title="Roles & permissions"
      description="Predefined roles. Custom permission keys cannot be assigned from the client."
    >
      {loading ? <Status>Loading…</Status> : null}
      {error ? <Status>{error}</Status> : null}
      {data?.roles.map((role) => (
        <article className="fc-admin-card" key={role.key}>
          <h2>{role.name}</h2>
          <p>{role.permissions.join(', ')}</p>
        </article>
      ))}
    </Page>
  );
}

export function AuditScreen() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const { data, error, loading } = useResource(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (action) params.set('action', action);
    return loadAdminAudit(params.toString());
  }, `${page}|${action}`);
  return (
    <Page title="Audit log" description="Immutable operational history.">
      <label className="fc-admin-filters">
        Action
        <input
          onChange={(event) => {
            setPage(1);
            setAction(event.target.value);
          }}
          value={action}
        />
      </label>
      {loading ? <Status>Loading…</Status> : null}
      {error ? <Status>{error}</Status> : null}
      {data && data.items.length === 0 ? (
        <Status>No audit entries match.</Status>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="fc-admin-table-wrap">
          <table className="fc-admin-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Target</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <a href={`/admin/audit/${item.id}`}>{item.action}</a>
                  </td>
                  <td>{item.targetType ?? '—'}</td>
                  <td>{item.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager
            onPage={setPage}
            page={data.page}
            totalPages={data.totalPages}
          />
        </div>
      ) : null}
    </Page>
  );
}

export function AuditDetailScreen({ id }: { id: string }) {
  const { data, error, loading } = useResource(() => loadAdminAuditEntry(id));
  if (loading)
    return (
      <Page title="Audit event">
        <Status>Loading…</Status>
      </Page>
    );
  if (error || !data)
    return (
      <Page title="Audit event">
        <Status>{error ?? 'Not found.'}</Status>
      </Page>
    );
  return (
    <Page title={data.action}>
      <dl className="fc-admin-dl">
        <div>
          <dt>Target</dt>
          <dd>
            {data.targetType} {data.targetId}
          </dd>
        </div>
        <div>
          <dt>Reason</dt>
          <dd>{data.reason ?? '—'}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>{data.createdAt}</dd>
        </div>
      </dl>
    </Page>
  );
}

export function SettingsScreen() {
  const { data, error, loading } = useResource(loadAdminSettings);
  return (
    <Page
      title="Platform settings"
      description="Read-only inspectable configuration. Runtime security and legal values cannot be edited here."
    >
      {loading ? <Status>Loading…</Status> : null}
      {error ? <Status>{error}</Status> : null}
      {data?.settings.map((setting) => (
        <article className="fc-admin-card" key={setting.key}>
          <h2>{setting.key}</h2>
          <p>Source: {setting.source}</p>
          <pre>{JSON.stringify(setting.value)}</pre>
        </article>
      ))}
    </Page>
  );
}

export function SystemScreen() {
  const { data, error, loading } = useResource(loadAdminSystem);
  if (loading)
    return (
      <Page title="System health">
        <Status>Loading…</Status>
      </Page>
    );
  if (error || !data)
    return (
      <Page title="System health">
        <Status>{error ?? 'Unavailable.'}</Status>
      </Page>
    );
  return (
    <Page
      title="System health"
      description="Facts available to this API process. Provider secrets are not shown."
    >
      <dl className="fc-admin-dl">
        <div>
          <dt>API</dt>
          <dd>{data.api}</dd>
        </div>
        <div>
          <dt>Database</dt>
          <dd>{data.database}</dd>
        </div>
        <div>
          <dt>Notification backlog</dt>
          <dd>{data.notificationBacklog}</dd>
        </div>
        <div>
          <dt>Unresolved job failures</dt>
          <dd>{data.unresolvedJobFailures}</dd>
        </div>
      </dl>
      <p>
        <Link href="/admin/system/jobs">Failed jobs</Link>
      </p>
    </Page>
  );
}

export function JobsScreen() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useResource(() => loadAdminJobs(page), page);
  return (
    <Page title="Failed jobs">
      {loading ? <Status>Loading…</Status> : null}
      {error ? <Status>{error}</Status> : null}
      {data && data.items.length === 0 ? (
        <Status>No job failures recorded.</Status>
      ) : null}
      {data && data.items.length > 0 ? (
        <div className="fc-admin-table-wrap">
          <table className="fc-admin-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Queue</th>
                <th>Resolved</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <a href={`/admin/system/jobs/${item.id}`}>{item.jobName}</a>
                  </td>
                  <td>{item.queue}</td>
                  <td>{item.resolvedAt ?? 'Open'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pager
            onPage={setPage}
            page={data.page}
            totalPages={data.totalPages}
          />
        </div>
      ) : null}
    </Page>
  );
}

export function JobDetailScreen({ id }: { id: string }) {
  const [refresh, setRefresh] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const { data, error, loading } = useResource(() => loadAdminJob(id), refresh);
  useEffect(() => {
    loadAdminSession()
      .then((session) => setPermissions(session.permissions))
      .catch(() => undefined);
  }, []);
  if (loading)
    return (
      <Page title="Failed job">
        <Status>Loading…</Status>
      </Page>
    );
  if (error || !data)
    return (
      <Page title="Failed job">
        <Status>{error ?? 'Not found.'}</Status>
      </Page>
    );
  return (
    <Page title={data.jobName}>
      <dl className="fc-admin-dl">
        <div>
          <dt>Queue</dt>
          <dd>{data.queue}</dd>
        </div>
        <div>
          <dt>Error</dt>
          <dd>{data.errorCode ?? '—'}</dd>
        </div>
        <div>
          <dt>Attempts</dt>
          <dd>{data.attempts}</dd>
        </div>
        <div>
          <dt>Resolved</dt>
          <dd>{data.resolvedAt ?? 'Open'}</dd>
        </div>
      </dl>
      {message ? <Status>{message}</Status> : null}
      {!data.resolvedAt &&
      data.jobName === 'notification-delivery' &&
      hasPermission(permissions, ADMIN_PERMISSIONS.jobsRetry) ? (
        <Button
          onClick={async () => {
            try {
              await retryAdminJob(id);
              setMessage('Retry accepted.');
              setRefresh((value) => value + 1);
            } catch (caught) {
              setMessage(
                caught instanceof AdminApiError
                  ? caught.message
                  : 'Could not retry.',
              );
            }
          }}
        >
          Retry job
        </Button>
      ) : null}
    </Page>
  );
}

export function SearchScreen({ initialQuery = '' }: { initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery);
  const { data, error, loading } = useResource(
    () =>
      submitted.length >= 2
        ? searchAdmin(submitted)
        : Promise.resolve({ q: submitted, results: [] }),
    submitted,
  );
  return (
    <Page
      title="Search"
      description="Permission-filtered operational search. Message and evidence bodies are never returned."
    >
      <form
        className="fc-admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(q.trim());
        }}
      >
        <Field
          label="Query"
          minLength={2}
          onChange={(event) => setQ(event.target.value)}
          value={q}
        />
        <Button type="submit">Search</Button>
      </form>
      {loading ? <Status>Loading…</Status> : null}
      {error ? <Status>{error}</Status> : null}
      {submitted.length >= 2 && data && data.results.length === 0 ? (
        <Status>No matching operational records.</Status>
      ) : null}
      {data && data.results.length > 0 ? (
        <ul className="fc-admin-list">
          {data.results.map((hit) => (
            <li key={`${hit.type}-${hit.id}`}>
              <a href={searchHref(hit.type, hit.id)}>
                {hit.type} · {hit.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </Page>
  );
}

function searchHref(type: string, id: string): string {
  if (type === 'member') return `/admin/members/${id}`;
  if (type === 'request') return `/admin/requests/${id}`;
  if (type === 'report') return `/admin/reports/${id}`;
  if (type === 'support') return `/admin/support/${id}`;
  return '/admin/search';
}
