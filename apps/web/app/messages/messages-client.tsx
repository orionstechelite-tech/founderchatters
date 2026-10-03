'use client';

import type {
  MemberConversation,
  MemberConversationsResponse,
  MemberMessage,
} from '@founderchatters/contracts';
import { Button } from '@founderchatters/ui';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { OnboardingApiError } from '../onboarding/onboarding-api';
import {
  getConversation,
  listConversationMessages,
  listConversations,
  sendConversationMessage,
} from '../member/member-api';
import { initialsFrom, requestAuthorMeta } from '../member/member-format';
import { BlockSheet } from '../safety/block-sheet';
import { ReportSheet } from '../safety/report-sheet';

function locationMeta(counterpart: {
  companyName: string;
  city: string | null;
  country: string | null;
}): string {
  return requestAuthorMeta(counterpart);
}

function previewText(
  conversation: MemberConversationsResponse['conversations'][number],
): string {
  if (!conversation.latestMessage) return 'No messages yet';
  return conversation.latestMessage.body;
}

export function MessagesClient({
  conversationId,
  viewerId,
}: {
  conversationId?: string;
  viewerId: string;
}) {
  const titleId = useId();
  const searchId = useId();
  const composerId = useId();
  const inflight = useRef(false);
  const clientMessageId = useRef<string | null>(null);
  const lastAttemptBody = useRef('');
  const [inbox, setInbox] = useState<MemberConversationsResponse | null>(null);
  const [query, setQuery] = useState('');
  const [safety, setSafety] = useState<
    { type: 'USER' | 'MESSAGE'; id: string } | 'block' | null
  >(null);
  const [search, setSearch] = useState('');
  const [conversation, setConversation] = useState<MemberConversation | null>(
    null,
  );
  const [messages, setMessages] = useState<MemberMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listConversations(search ? { q: search } : {})
      .then((payload) => {
        if (!cancelled) {
          setInbox(payload);
          setError(null);
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof OnboardingApiError
            ? cause.message
            : 'Conversations are unavailable.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [search]);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    void Promise.all([
      getConversation(conversationId),
      listConversationMessages(conversationId),
    ])
      .then(([detail, history]) => {
        if (cancelled) return;
        setConversation(detail.conversation);
        setMessages(history.messages);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setConversation(null);
        setMessages([]);
        setError(
          cause instanceof OnboardingApiError
            ? cause.message
            : 'That conversation is not available.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  async function send() {
    if (!conversationId || inflight.current || !conversation?.canSend) return;
    inflight.current = true;
    setBusy(true);
    const body = draft;
    if (clientMessageId.current === null || lastAttemptBody.current !== body) {
      clientMessageId.current = crypto.randomUUID();
      lastAttemptBody.current = body;
    }
    const id = clientMessageId.current;
    try {
      const payload = await sendConversationMessage(conversationId, {
        clientMessageId: id,
        body,
      });
      setDraft('');
      clientMessageId.current = null;
      lastAttemptBody.current = '';
      setMessages((current) =>
        current.some((row) => row.id === payload.message.id)
          ? current
          : [...current, payload.message],
      );
      const [detail, listed] = await Promise.all([
        getConversation(conversationId),
        listConversations(search ? { q: search } : {}),
      ]);
      setConversation(detail.conversation);
      setInbox(listed);
      setError(null);
    } catch (cause: unknown) {
      setError(
        cause instanceof OnboardingApiError
          ? cause.message
          : 'We could not send that message.',
      );
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  const conversations = inbox?.conversations ?? [];
  const emptyInbox = Boolean(inbox && inbox.q === null && inbox.total === 0);
  const searchZero = Boolean(inbox && inbox.q !== null && inbox.total === 0);
  const counterpart = conversation?.counterpart ?? null;
  const context = conversation?.requestContext;
  const pane = conversationId ? 'detail' : 'inbox';

  return (
    <div className="fc-messages" data-pane={pane}>
      <section className="fc-messages-hero" aria-labelledby={titleId}>
        <p className="fc-label">Messages</p>
        <h1 id={titleId}>Conversations stay tied to the problem.</h1>
        <p className="fc-messages-lead">
          A message thread should remember why you started talking in the first
          place.
        </p>
      </section>

      {error ? (
        <p className="fc-ask-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="fc-messages-layout" data-pane={pane}>
        <section className="fc-messages-inbox" aria-label="Inbox">
          <p className="fc-label">Inbox</p>
          <form
            className="fc-messages-search"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(query.trim());
            }}
          >
            <label className="sr-only" htmlFor={searchId}>
              Search conversations
            </label>
            <input
              id={searchId}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search conversations…"
              type="search"
              value={query}
            />
          </form>

          {!inbox ? (
            <p className="fc-discover-status">Loading conversations…</p>
          ) : emptyInbox ? (
            <div className="fc-messages-state">
              <h2>No conversations yet</h2>
              <p>
                Private conversations start from a founder’s request when they
                offer or accept help.
              </p>
              <a
                className="fc-button fc-button--medium fc-button--primary"
                href="/home"
              >
                Go to Home
              </a>
            </div>
          ) : searchZero ? (
            <div className="fc-messages-state">
              <h2>No conversations found</h2>
              <Button
                onClick={() => {
                  setQuery('');
                  setSearch('');
                }}
                type="button"
                variant="secondary"
              >
                Clear search
              </Button>
            </div>
          ) : (
            <ul className="fc-messages-list">
              {conversations.map((item) => {
                const selected = item.id === conversationId;
                const name =
                  item.counterpart?.displayName ?? 'Member unavailable';
                return (
                  <li key={item.id}>
                    <Link
                      aria-current={selected ? 'page' : undefined}
                      className={
                        selected
                          ? 'fc-messages-row fc-messages-row--active'
                          : 'fc-messages-row'
                      }
                      href={`/messages/${item.id}`}
                    >
                      <span aria-hidden="true" className="fc-messages-avatar">
                        {item.counterpart
                          ? initialsFrom(item.counterpart.displayName)
                          : 'FC'}
                      </span>
                      <span className="fc-messages-row__name">{name}</span>
                      <span className="fc-messages-row__meta">
                        {item.counterpart
                          ? locationMeta(item.counterpart)
                          : 'Member unavailable'}
                      </span>
                      <span className="fc-messages-row__preview">
                        {previewText(item)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="fc-messages-detail" aria-label="Conversation">
          {conversationId ? (
            conversation ? (
              <>
                <header className="fc-messages-header">
                  <Link className="fc-messages-back" href="/messages">
                    Back
                  </Link>
                  <span aria-hidden="true" className="fc-messages-avatar">
                    {counterpart ? initialsFrom(counterpart.displayName) : 'FC'}
                  </span>
                  <div>
                    <p className="fc-messages-header__name">
                      {counterpart?.displayName ?? 'Member unavailable'}
                    </p>
                    <p className="fc-messages-header__meta">
                      {counterpart
                        ? `Founder · ${locationMeta(counterpart)}`
                        : 'Member unavailable'}
                    </p>
                  </div>
                  {counterpart ? (
                    <>
                      <a
                        className="fc-button fc-button--medium fc-button--secondary"
                        href={`/founders/${counterpart.id}`}
                      >
                        View profile
                      </a>
                      <Button
                        onClick={() =>
                          setSafety({ type: 'USER', id: counterpart.id })
                        }
                        type="button"
                        variant="secondary"
                      >
                        Report founder
                      </Button>
                      <Button
                        onClick={() => setSafety('block')}
                        type="button"
                        variant="secondary"
                      >
                        Block founder
                      </Button>
                    </>
                  ) : null}
                </header>

                <div className="fc-messages-context">
                  <p className="fc-label">Request context</p>
                  {context?.available ? (
                    <>
                      <p>
                        <a href={`/requests/${context.id}`}>
                          {context.headline}
                        </a>
                      </p>
                      <p>
                        {context.topics
                          .map((topic) => topic.label)
                          .join(' · ') || 'Request'}
                      </p>
                    </>
                  ) : (
                    <p>Request unavailable</p>
                  )}
                </div>

                <ol className="fc-messages-thread">
                  {messages.map((message) => {
                    const mine = message.senderId === viewerId;
                    return (
                      <li
                        className={
                          mine
                            ? 'fc-messages-bubble fc-messages-bubble--mine'
                            : 'fc-messages-bubble'
                        }
                        key={message.id}
                      >
                        <p className="fc-messages-bubble__label">
                          {mine
                            ? 'You'
                            : (counterpart?.displayName ?? 'Member')}
                        </p>
                        {message.removed || message.body === null ? (
                          <p>Message removed</p>
                        ) : (
                          <p>{message.body}</p>
                        )}
                        {!mine ? (
                          <button
                            className="fc-safety-text-action"
                            onClick={() =>
                              setSafety({ type: 'MESSAGE', id: message.id })
                            }
                            type="button"
                          >
                            Report message
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>

                {conversation.canSend ? (
                  <form
                    className="fc-messages-composer"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void send();
                    }}
                  >
                    <label className="sr-only" htmlFor={composerId}>
                      Write a message
                    </label>
                    <textarea
                      id={composerId}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="Write a message…"
                      rows={2}
                      value={draft}
                    />
                    <Button disabled={busy} type="submit">
                      Send
                    </Button>
                  </form>
                ) : (
                  <p className="fc-messages-unavailable">
                    Messaging is unavailable.
                  </p>
                )}
              </>
            ) : (
              <p className="fc-discover-status">Loading conversation…</p>
            )
          ) : (
            <div className="fc-messages-empty-detail">
              <p>Select a conversation to continue a request-linked thread.</p>
            </div>
          )}
        </section>
      </div>
      <ReportSheet
        onClose={() => setSafety(null)}
        open={typeof safety === 'object' && safety?.type === 'USER'}
        targetId={
          typeof safety === 'object' && safety?.type === 'USER' ? safety.id : ''
        }
        targetType="USER"
      />
      <ReportSheet
        onClose={() => setSafety(null)}
        open={typeof safety === 'object' && safety?.type === 'MESSAGE'}
        targetId={
          typeof safety === 'object' && safety?.type === 'MESSAGE'
            ? safety.id
            : ''
        }
        targetType="MESSAGE"
      />
      {counterpart ? (
        <BlockSheet
          founderId={counterpart.id}
          founderName={counterpart.displayName}
          onClose={() => setSafety(null)}
          open={safety === 'block'}
        />
      ) : null}
    </div>
  );
}
