'use client';

import type { AdminReportQueueItem } from '@founderchatters/contracts';
import { useEffect, useState } from 'react';

import { AdminApiError, loadAdminReports } from '../admin-api';

export function ReportsQueueClient() {
  const [reports, setReports] = useState<AdminReportQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadAdminReports()
      .then((payload) => {
        if (cancelled) return;
        setReports(payload.reports);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof AdminApiError
            ? cause.message
            : 'Reports are unavailable.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="fc-admin-panel">
      <p className="fc-label">Moderation</p>
      <h1>Reports</h1>
      {error ? (
        <p className="fc-settings-error" role="alert">
          {error}
        </p>
      ) : reports === null ? (
        <p>Loading reports…</p>
      ) : reports.length === 0 ? (
        <p>No reports in the queue.</p>
      ) : (
        <ul className="fc-admin-report-list">
          {reports.map((report) => (
            <li key={report.id}>
              <a href={`/admin/reports/${report.id}`}>
                <strong>{report.targetType}</strong> · {report.reasonCode}
                <span>
                  {report.status} · {report.createdAt}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
