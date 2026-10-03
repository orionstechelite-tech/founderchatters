'use client';

import type {
  MemberNotification,
  MemberNotificationsResponse,
} from '@founderchatters/contracts';
import { Button } from '@founderchatters/ui';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../member/member-api';
import { OnboardingApiError } from '../onboarding/onboarding-api';

function formatNotificationTime(value: string): string {
  const date = new Date(value);
  const deltaMs = date.getTime() - Date.now();
  const absoluteMs = Math.abs(deltaMs);
  const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (absoluteMs < 60_000) return 'Now';

  if (absoluteMs < 3_600_000) {
    return relative.format(Math.round(deltaMs / 60_000), 'minute');
  }

  if (absoluteMs < 86_400_000) {
    return relative.format(Math.round(deltaMs / 3_600_000), 'hour');
  }

  if (absoluteMs < 604_800_000) {
    return relative.format(Math.round(deltaMs / 86_400_000), 'day');
  }

  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

function mergeNotifications(
  current: MemberNotification[],
  incoming: MemberNotification[],
): MemberNotification[] {
  const seen = new Set(current.map((item) => item.id));
  return [
    ...current,
    ...incoming.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  ];
}

export function NotificationsClient() {
  const [payload, setPayload] = useState<MemberNotificationsResponse | null>(
    null,
  );
  const [notifications, setNotifications] = useState<MemberNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void listNotifications()
      .then((next) => {
        if (cancelled) return;
        setPayload(next);
        setNotifications(next.notifications);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof OnboardingApiError
            ? cause.message
            : 'Notifications are unavailable.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((item) => item.readAt === null).length,
    [notifications],
  );

  async function readOne(id: string) {
    const target = notifications.find((item) => item.id === id);
    if (!target || target.readAt !== null) return;

    try {
      const next = await markNotificationRead(id);
      setNotifications((current) =>
        current.map((item) => (item.id === id ? next.notification : item)),
      );
    } catch (cause: unknown) {
      setError(
        cause instanceof OnboardingApiError
          ? cause.message
          : 'We could not mark that notification as read.',
      );
    }
  }

  async function readAll() {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);

    try {
      await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) =>
          item.readAt === null ? { ...item, readAt } : item,
        ),
      );
      setError(null);
    } catch (cause: unknown) {
      setError(
        cause instanceof OnboardingApiError
          ? cause.message
          : 'We could not mark notifications as read.',
      );
    } finally {
      setMarkingAll(false);
    }
  }

  async function loadMore() {
    if (!payload?.nextBefore || loadingMore) return;
    setLoadingMore(true);

    try {
      const next = await listNotifications({
        before: payload.nextBefore,
      });
      setNotifications((current) =>
        mergeNotifications(current, next.notifications),
      );
      setPayload(next);
      setError(null);
    } catch (cause: unknown) {
      setError(
        cause instanceof OnboardingApiError
          ? cause.message
          : 'We could not load more notifications.',
      );
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="fc-notifications">
      <section className="fc-notifications-hero">
        <div className="fc-notifications-heading">
          <div>
            <p className="fc-label">Notifications</p>
            <h1>
              <span className="fc-notifications-title-desktop">
                Only what needs your attention.
              </span>
              <span className="fc-notifications-title-mobile">
                Notifications
              </span>
            </h1>
            <p className="fc-notifications-lead">
              Activity that needs your attention.
            </p>
          </div>
          <span aria-hidden="true" className="fc-notifications-more">
            •••
          </span>
        </div>
      </section>

      {error ? (
        <p className="fc-ask-error" role="alert">
          {error}
        </p>
      ) : null}

      {!payload ? (
        <p className="fc-discover-status">Loading notifications...</p>
      ) : notifications.length === 0 ? (
        <section className="fc-notifications-empty">
          <p className="fc-label">All clear</p>
          <h2>Nothing needs your attention.</h2>
          <p>
            When something needs a response or an update, it will appear here.
          </p>
        </section>
      ) : (
        <>
          <div className="fc-notifications-toolbar">
            <p>
              {unreadCount === 0
                ? 'You are all caught up.'
                : `${unreadCount} unread`}
            </p>
            {unreadCount > 0 ? (
              <Button
                disabled={markingAll}
                onClick={() => void readAll()}
                type="button"
                variant="secondary"
              >
                {markingAll ? 'Marking...' : 'Mark all read'}
              </Button>
            ) : null}
          </div>

          <ul className="fc-notifications-list">
            {notifications.map((item) => {
              const content = (
                <>
                  <span
                    aria-hidden="true"
                    className="fc-notifications-dot"
                    data-read={item.readAt !== null}
                  />
                  <span className="fc-notifications-copy">
                    <span className="fc-notifications-row-title">
                      {item.title}
                    </span>
                    {item.body ? (
                      <span className="fc-notifications-row-body">
                        {item.body}
                      </span>
                    ) : null}
                  </span>
                  <time
                    className="fc-notifications-time"
                    dateTime={item.createdAt}
                  >
                    {formatNotificationTime(item.createdAt)}
                  </time>
                </>
              );

              return (
                <li key={item.id}>
                  {item.href ? (
                    <Link
                      className={
                        item.readAt === null
                          ? 'fc-notifications-row fc-notifications-row--unread'
                          : 'fc-notifications-row'
                      }
                      href={item.href}
                      onClick={() => void readOne(item.id)}
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      className={
                        item.readAt === null
                          ? 'fc-notifications-row fc-notifications-row--unread'
                          : 'fc-notifications-row'
                      }
                      onClick={() => void readOne(item.id)}
                      type="button"
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {payload.nextBefore ? (
            <div className="fc-notifications-load-more">
              <Button
                disabled={loadingMore}
                onClick={() => void loadMore()}
                type="button"
                variant="secondary"
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
