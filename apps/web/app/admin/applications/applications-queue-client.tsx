'use client';

import type {
  AdminApplicationQueueItem,
  AdminApplicationQueueResponse,
  AdminApplicationQueueStatus,
} from '@founderchatters/contracts';
import { Button } from '@founderchatters/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { AdminApiError, loadAdminQueue, queueQuery } from '../admin-api';

const tabs: Array<{ status: AdminApplicationQueueStatus; label: string }> = [
  { status: 'SUBMITTED', label: 'Pending' },
  { status: 'NEEDS_INFO', label: 'Needs info' },
  { status: 'APPROVED', label: 'Approved' },
  { status: 'REJECTED', label: 'Rejected' },
];

export function ApplicationsQueueClient() {
  const router = useRouter();
  const [status, setStatus] =
    useState<AdminApplicationQueueStatus>('SUBMITTED');
  const [country, setCountry] = useState('');
  const [page, setPage] = useState(1);
  const [queue, setQueue] = useState<AdminApplicationQueueResponse | null>(
    null,
  );
  const [reload, setReload] = useState(0);
  const [message, setMessage] = useState('');
  const [view, setView] = useState<'loading' | 'ready' | 'error' | 'denied'>(
    'loading',
  );

  useEffect(() => {
    let cancelled = false;
    void loadAdminQueue(queueQuery({ status, country, page }))
      .then((response) => {
        if (cancelled) return;
        setQueue(response);
        setMessage('');
        setView('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (
          error instanceof AdminApiError &&
          error.code === 'AUTH_SESSION_EXPIRED'
        ) {
          router.replace('/signin');
          return;
        }
        if (
          error instanceof AdminApiError &&
          error.code === 'ADMIN_PERMISSION_DENIED'
        ) {
          setMessage(error.message);
          setView('denied');
          return;
        }
        setMessage(
          error instanceof Error
            ? error.message
            : 'We could not load the application queue.',
        );
        setView('error');
      });
    return () => {
      cancelled = true;
    };
  }, [status, country, page, reload, router]);

  function refresh(
    next: Partial<{
      status: AdminApplicationQueueStatus;
      country: string;
      page: number;
    }> = {},
  ) {
    const nextStatus = next.status ?? status;
    const nextCountry = next.country !== undefined ? next.country : country;
    const nextPage =
      next.page ?? (next.status || next.country !== undefined ? 1 : page);
    const changed =
      nextStatus !== status || nextCountry !== country || nextPage !== page;
    if (!changed) {
      if (!next.status && next.country === undefined && !next.page) {
        setView('loading');
        setReload((current) => current + 1);
      }
      return;
    }
    setView('loading');
    setStatus(nextStatus);
    setCountry(nextCountry);
    setPage(nextPage);
  }

  if (view === 'denied') {
    return (
      <AdminState title="You don’t have permission to review applications">
        {message}
      </AdminState>
    );
  }
  if (view === 'error') {
    return (
      <AdminState title="We couldn’t load applications">
        {message}
        <Button
          className="fc-admin-applications-retry"
          onClick={() => refresh()}
          variant="secondary"
        >
          Try again
        </Button>
      </AdminState>
    );
  }

  return (
    <section className="fc-admin-applications">
      <header className="fc-admin-applications__header">
        <h1>Applications</h1>
        <p>
          Review founder admissions with evidence, clear ownership and decision
          history.
        </p>
      </header>
      <div className="fc-admin-applications__filters">
        <div role="tablist">
          {tabs.map((tab) => (
            <button
              aria-selected={status === tab.status}
              className="fc-admin-applications__tab"
              key={tab.status}
              onClick={() => refresh({ status: tab.status })}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
        <label className="fc-admin-applications__country">
          Country
          <select
            onChange={(event) =>
              refresh({ country: event.currentTarget.value })
            }
            value={country}
          >
            <option value="">All countries</option>
            {(queue?.countries ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      {view === 'loading' || !queue ? (
        <p className="fc-admin-applications__status" role="status">
          Loading applications…
        </p>
      ) : (queue.applications?.length ?? 0) === 0 ? (
        <p className="fc-admin-applications__status">
          {`No ${tabLabel(status).toLowerCase()} applications${country ? ` in ${country}` : ''}.`}
        </p>
      ) : (
        <>
          <div className="fc-admin-applications__table-wrap">
            <table className="fc-admin-applications__table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Company</th>
                  <th>Location</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {queue.applications.map((application) => (
                  <QueueRow application={application} key={application.id} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="fc-admin-applications__pagination">
            <p>
              Showing {showingFrom(queue)}–{showingTo(queue)} of {queue.total}{' '}
              {tabLabel(status).toLowerCase()} applications
            </p>
            <div>
              <Button
                disabled={queue.page <= 1}
                onClick={() => refresh({ page: queue.page - 1 })}
                variant="secondary"
              >
                Previous
              </Button>
              <span>
                Page {queue.page} of {queue.totalPages}
              </span>
              <Button
                disabled={queue.page >= queue.totalPages}
                onClick={() => refresh({ page: queue.page + 1 })}
                variant="secondary"
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function QueueRow({
  application,
}: {
  readonly application: AdminApplicationQueueItem;
}) {
  return (
    <tr>
      <td>
        <span className="fc-admin-applications__applicant">Applicant</span>
        <span>{application.applicantEmail}</span>
      </td>
      <td>{application.companyName || '—'}</td>
      <td>{locationLabel(application.city, application.country)}</td>
      <td>
        {application.submittedAt ? relativeTime(application.submittedAt) : '—'}
      </td>
      <td>
        <span className="fc-admin-applications__badge">
          {tabLabel(application.status)}
        </span>
      </td>
      <td>
        <Link href={`/admin/applications/${application.id}`}>Open</Link>
      </td>
    </tr>
  );
}

function AdminState({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <section className="fc-admin-applications-state">
      <h1>{title}</h1>
      <div>{children}</div>
    </section>
  );
}

function tabLabel(status: AdminApplicationQueueStatus): string {
  return tabs.find((tab) => tab.status === status)?.label ?? status;
}

function locationLabel(city: string | null, country: string | null): string {
  return [city, country].filter(Boolean).join(', ') || '—';
}

function relativeTime(value: string): string {
  const delta = Date.now() - new Date(value).getTime();
  const hours = Math.max(1, Math.round(delta / 3_600_000));
  return `${String(hours)}h ago`;
}

function showingFrom(queue: AdminApplicationQueueResponse): number {
  if (queue.total === 0) return 0;
  return (queue.page - 1) * queue.pageSize + 1;
}

function showingTo(queue: AdminApplicationQueueResponse): number {
  return Math.min(queue.total, queue.page * queue.pageSize);
}
