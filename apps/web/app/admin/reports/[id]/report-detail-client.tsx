'use client';

import type { AdminReportDetail } from '@founderchatters/contracts';
import { Button } from '@founderchatters/ui';
import { useEffect, useState } from 'react';

import {
  AdminApiError,
  decideAdminReport,
  loadAdminReport,
} from '../../admin-api';

function evidenceCopy(report: AdminReportDetail): string {
  const evidence = report.evidence;
  if (evidence.kind === 'USER') {
    return `${evidence.displayName} · ${evidence.status}`;
  }
  if (evidence.kind === 'REQUEST') {
    return `${evidence.headline} · ${evidence.status}`;
  }
  if (evidence.kind === 'RESPONSE') {
    return `${evidence.type} on request ${evidence.requestId}`;
  }
  return `Message ${evidence.messageId}`;
}

function formatTimestamp(value: string): string {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function ReportDetailClient({ reportId }: { reportId: string }) {
  const [report, setReport] = useState<AdminReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadAdminReport(reportId)
      .then((payload) => {
        if (cancelled) return;
        setReport(payload.report);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof AdminApiError
            ? cause.message
            : 'That report is not available.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  async function act(action: 'review' | 'dismiss' | 'enforce') {
    if (busy) return;
    setBusy(true);
    try {
      const payload = await decideAdminReport(reportId, action);
      setReport(payload.report);
      setError(null);
    } catch (cause: unknown) {
      setError(
        cause instanceof AdminApiError
          ? cause.message
          : 'We could not update that report.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (error && !report) {
    return <p className="fc-settings-error">{error}</p>;
  }
  if (!report) return <p>Loading report…</p>;

  const openish = report.status === 'OPEN' || report.status === 'UNDER_REVIEW';
  const evidence = report.evidence;

  return (
    <article className="fc-admin-panel">
      <p className="fc-label">Report</p>
      <h1>
        {report.targetType} · {report.reasonCode}
      </h1>
      <p>Status: {report.status}</p>
      <p>Reporter: {report.reporter.displayName}</p>
      {report.details ? <p>{report.details}</p> : null}
      <section className="fc-settings-card" aria-labelledby="scoped-evidence">
        <p className="fc-label" id="scoped-evidence">
          Scoped evidence
        </p>
        {evidence.kind === 'MESSAGE' ? (
          <div className="fc-admin-reported-message">
            <h2>Reported message</h2>
            <p>Sender: {evidence.sender.displayName || 'Unavailable'}</p>
            <p>Sent {formatTimestamp(evidence.createdAt)}</p>
            <p>
              Moderation status:{' '}
              {evidence.deletedAt
                ? 'Removed from member view'
                : 'Visible to participants'}
            </p>
            <p className="fc-admin-report-body">{evidence.body}</p>
            <p className="fc-admin-report-note">
              This view contains only the message attached to this report.
            </p>
          </div>
        ) : (
          <p>{evidenceCopy(report)}</p>
        )}
      </section>
      {error ? (
        <p className="fc-settings-error" role="alert">
          {error}
        </p>
      ) : null}
      {openish ? (
        <div className="fc-request-actions">
          {report.status === 'OPEN' ? (
            <Button disabled={busy} onClick={() => void act('review')}>
              Review
            </Button>
          ) : null}
          <Button
            disabled={busy}
            onClick={() => void act('dismiss')}
            variant="secondary"
          >
            Dismiss
          </Button>
          <Button disabled={busy} onClick={() => void act('enforce')}>
            Enforce
          </Button>
        </div>
      ) : null}
    </article>
  );
}
