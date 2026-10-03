'use client';

import {
  REPORT_REASON_CODES,
  REPORT_REASON_LABELS,
  type ReportReasonCode,
  type ReportTargetType,
} from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import { useState } from 'react';

import { createMemberReport } from '../member/member-api';
import { OnboardingApiError } from '../onboarding/onboarding-api';

const reasons = Object.values(REPORT_REASON_CODES);

export function ReportSheet({
  open,
  targetType,
  targetId,
  onClose,
}: {
  open: boolean;
  targetType: ReportTargetType;
  targetId: string;
  onClose: () => void;
}) {
  const [reasonCode, setReasonCode] = useState<ReportReasonCode | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!open) return null;

  async function submit() {
    if (busy || !reasonCode) return;
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await createMemberReport({
        targetType,
        targetId,
        reasonCode,
        details,
      });
      setSubmitted(true);
    } catch (cause: unknown) {
      if (cause instanceof OnboardingApiError) {
        setError(cause.message);
        setFieldErrors(cause.fieldErrors);
      } else {
        setError('We could not submit that report.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fc-safety-overlay">
      <div
        className="fc-safety-sheet"
        role="dialog"
        aria-labelledby="report-title"
      >
        <header className="fc-safety-sheet__top">
          <p className="fc-safety-kicker">Report</p>
          <button
            aria-label="Close report"
            className="fc-safety-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <h2 id="report-title">Report this content</h2>
        <p>
          Choose the closest reason. The reported founder won’t see who
          submitted the report.
        </p>
        {submitted ? (
          <p className="fc-safety-success" role="status">
            Report submitted. Thank you for helping keep the network safe.
          </p>
        ) : (
          <>
            {error ? (
              <p className="fc-settings-error" role="alert">
                {error}
              </p>
            ) : null}
            <div
              className="fc-safety-reasons"
              role="radiogroup"
              aria-label="Report reason"
            >
              {reasons.map((code) => (
                <button
                  aria-pressed={reasonCode === code}
                  className="fc-safety-reason"
                  key={code}
                  onClick={() => setReasonCode(code)}
                  type="button"
                >
                  {REPORT_REASON_LABELS[code]}
                </button>
              ))}
            </div>
            <Field
              {...(fieldErrors.details?.[0]
                ? { error: fieldErrors.details[0] }
                : {})}
              fieldType="textarea"
              label="Additional context"
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Optional. Do not include passwords or sensitive payment information."
              rows={4}
              value={details}
            />
            <Button
              disabled={busy || !reasonCode}
              onClick={() => void submit()}
            >
              {busy ? 'Submitting…' : 'Submit report'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
