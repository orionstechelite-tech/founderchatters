'use client';

import type { MemberSession } from '@founderchatters/contracts';
import { Button, Field } from '@founderchatters/ui';
import { useEffect, useState } from 'react';

import {
  changeMemberPassword,
  listMemberSessions,
  revokeMemberSession,
  revokeOtherMemberSessions,
} from '../../member/member-api';
import { OnboardingApiError } from '../../onboarding/onboarding-api';

function sessionLabel(userAgent: string | null): string {
  if (!userAgent?.trim()) return 'Unknown browser or device';
  return userAgent;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function SecuritySettingsClient() {
  const [sessions, setSessions] = useState<MemberSession[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [revokeBusy, setRevokeBusy] = useState<string | null>(null);
  const [revokeAllBusy, setRevokeAllBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordFields, setPasswordFields] = useState<
    Record<string, string[]>
  >({});
  const [passwordSaved, setPasswordSaved] = useState(false);

  async function refreshSessions() {
    try {
      const response = await listMemberSessions();
      setSessions(response.sessions);
      setSessionError(null);
    } catch (cause: unknown) {
      setSessionError(
        cause instanceof OnboardingApiError
          ? cause.message
          : 'Active sessions are unavailable.',
      );
    } finally {
      setSessionsLoaded(true);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void listMemberSessions()
      .then((response) => {
        if (cancelled) return;
        setSessions(response.sessions);
        setSessionError(null);
        setSessionsLoaded(true);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setSessionError(
          cause instanceof OnboardingApiError
            ? cause.message
            : 'Active sessions are unavailable.',
        );
        setSessionsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function revoke(id: string) {
    if (revokeBusy || revokeAllBusy) return;
    setRevokeBusy(id);

    try {
      await revokeMemberSession(id);
      setSessions((current) => current.filter((item) => item.id !== id));
      setSessionError(null);
    } catch (cause: unknown) {
      setSessionError(
        cause instanceof OnboardingApiError
          ? cause.message
          : 'We could not revoke that session.',
      );
    } finally {
      setRevokeBusy(null);
    }
  }

  async function revokeOthers() {
    if (revokeAllBusy || revokeBusy) return;
    setRevokeAllBusy(true);

    try {
      await revokeOtherMemberSessions();
      await refreshSessions();
    } catch (cause: unknown) {
      setSessionError(
        cause instanceof OnboardingApiError
          ? cause.message
          : 'We could not revoke the other sessions.',
      );
    } finally {
      setRevokeAllBusy(false);
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordBusy) return;

    setPasswordBusy(true);
    setPasswordError(null);
    setPasswordFields({});
    setPasswordSaved(false);

    try {
      await changeMemberPassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSaved(true);
      await refreshSessions();
    } catch (cause: unknown) {
      if (cause instanceof OnboardingApiError) {
        setPasswordError(cause.message);
        setPasswordFields(cause.fieldErrors);
      } else {
        setPasswordError('We could not change your password.');
      }
    } finally {
      setPasswordBusy(false);
    }
  }

  const otherSessions = sessions.filter((session) => !session.current);

  return (
    <>
      <header className="fc-settings-section-header">
        <p className="fc-label">Security</p>
        <h2>Password &amp; sessions</h2>
        <p>
          Keep your password current and end sessions you no longer recognize.
        </p>
      </header>

      <div className="fc-settings-security-grid">
        <section
          aria-labelledby="change-password-heading"
          className="fc-settings-card"
        >
          <p className="fc-label">Password</p>
          <h3 id="change-password-heading">Change password</h3>

          {passwordError ? (
            <p className="fc-settings-error" role="alert">
              {passwordError}
            </p>
          ) : null}

          <form className="fc-settings-password-form" onSubmit={changePassword}>
            <Field
              autoComplete="current-password"
              {...(passwordFields.currentPassword?.[0]
                ? { error: passwordFields.currentPassword[0] }
                : {})}
              label="Current password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              value={currentPassword}
            />

            <Field
              autoComplete="new-password"
              {...(passwordFields.newPassword?.[0]
                ? { error: passwordFields.newPassword[0] }
                : {})}
              hint="Use 12–128 characters."
              label="New password"
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              value={newPassword}
            />

            <Field
              autoComplete="new-password"
              {...(passwordFields.confirmPassword?.[0]
                ? { error: passwordFields.confirmPassword[0] }
                : {})}
              label="Confirm new password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              value={confirmPassword}
            />

            <span aria-live="polite" className="fc-settings-save-status">
              {passwordSaved ? 'Password changed.' : ''}
            </span>

            <Button disabled={passwordBusy} type="submit">
              {passwordBusy ? 'Changing…' : 'Change password'}
            </Button>
          </form>
        </section>

        <section
          aria-labelledby="active-sessions-heading"
          className="fc-settings-card"
        >
          <div className="fc-settings-card-heading">
            <div>
              <p className="fc-label">Sessions</p>
              <h3 id="active-sessions-heading">Active sessions</h3>
            </div>

            {otherSessions.length > 0 ? (
              <Button
                disabled={revokeAllBusy}
                onClick={() => void revokeOthers()}
                size="small"
                type="button"
                variant="secondary"
              >
                {revokeAllBusy ? 'Revoking…' : 'Revoke all others'}
              </Button>
            ) : null}
          </div>

          {sessionError ? (
            <p className="fc-settings-error" role="alert">
              {sessionError}
            </p>
          ) : !sessionsLoaded ? (
            <p className="fc-settings-status">Loading active sessions…</p>
          ) : sessions.length === 0 ? (
            <p className="fc-settings-status">No active sessions found.</p>
          ) : (
            <ul className="fc-settings-session-list">
              {sessions.map((session) => (
                <li key={session.id}>
                  <div>
                    <p className="fc-settings-session-title">
                      {session.current
                        ? 'This device'
                        : sessionLabel(session.userAgent)}
                    </p>
                    {session.current && session.userAgent ? (
                      <p className="fc-settings-session-agent">
                        {session.userAgent}
                      </p>
                    ) : null}
                    <p className="fc-settings-session-meta">
                      Started {formatDate(session.createdAt)}
                    </p>
                  </div>

                  {session.current ? (
                    <span className="fc-settings-current-session">Current</span>
                  ) : (
                    <Button
                      disabled={revokeBusy === session.id}
                      onClick={() => void revoke(session.id)}
                      size="small"
                      type="button"
                      variant="secondary"
                    >
                      {revokeBusy === session.id ? 'Revoking…' : 'Revoke'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
