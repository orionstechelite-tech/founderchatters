import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  MESSAGING_ERROR_CODES,
  MESSAGING_LIMITS,
} from '@founderchatters/contracts';

import {
  conversationCreatedEvent,
  eventHasPrivateBody,
  messageSentEvent,
} from '../src/conversations/conversations-events.js';
import {
  parseConversationsListQuery,
  parseCreateConversationBody,
  parseMessagesHistoryQuery,
  parseSendMessageBody,
} from '../src/conversations/conversations-query.js';
import { MessagingRateLimiter } from '../src/conversations/messaging-rate-limiter.js';
import { ApiError } from '../src/http/api-error.js';

describe('messaging input', () => {
  it('accepts only privateChatOfferResponseId on create', () => {
    expect(
      parseCreateConversationBody({
        privateChatOfferResponseId: 'resp-1',
      }).privateChatOfferResponseId,
    ).toBe('resp-1');
    for (const extra of [
      'requestId',
      'participantIds',
      'userId',
      'helperId',
      'status',
      'createdAt',
      'updatedAt',
      'conversationId',
      'senderId',
      'body',
    ]) {
      expect(() =>
        parseCreateConversationBody({
          privateChatOfferResponseId: 'resp-1',
          [extra]: 'smuggled',
        }),
      ).toThrow();
    }
  });

  it('requires a trimmed 1–4000 character body and canonical UUID v4', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    expect(() =>
      parseSendMessageBody({ clientMessageId: id, body: '   ' }),
    ).toThrow();
    expect(parseSendMessageBody({ clientMessageId: id, body: 'x' }).body).toBe(
      'x',
    );
    expect(
      parseSendMessageBody({
        clientMessageId: id,
        body: 'x'.repeat(MESSAGING_LIMITS.bodyMax),
      }).body,
    ).toHaveLength(4000);
    expect(() =>
      parseSendMessageBody({
        clientMessageId: id,
        body: 'x'.repeat(4001),
      }),
    ).toThrow();
    const trimmed = parseSendMessageBody({
      clientMessageId: id.toUpperCase(),
      body: '  hello\nthere  ',
    });
    expect(trimmed.body).toBe('hello\nthere');
    expect(trimmed.clientMessageId).toBe(id);
    expect(() =>
      parseSendMessageBody({
        clientMessageId: 'not-a-uuid',
        body: 'hello',
      }),
    ).toThrow();
    expect(() =>
      parseSendMessageBody({
        clientMessageId: '550e8400-e29b-11d4-a716-446655440000',
        body: 'hello',
      }),
    ).toThrow();
    expect(() => parseSendMessageBody({ body: 'hello' })).toThrow();
    expect(() =>
      parseSendMessageBody({ clientMessageId: '', body: 'hello' }),
    ).toThrow();
    expect(() =>
      parseSendMessageBody({ clientMessageId: [id], body: 'hello' }),
    ).toThrow();
    expect(() =>
      parseSendMessageBody({ clientMessageId: 1, body: 'hello' }),
    ).toThrow();
    expect(() =>
      parseSendMessageBody({ clientMessageId: null, body: 'hello' }),
    ).toThrow();
    expect(
      parseSendMessageBody({
        clientMessageId: id,
        body: '<script>alert(1)</script>',
      }).body,
    ).toBe('<script>alert(1)</script>');
    for (const extra of [
      'senderId',
      'conversationId',
      'requestId',
      'deletedAt',
      'createdAt',
      'id',
      'participantIds',
      'status',
      'updatedAt',
      'userId',
      'authorId',
      'email',
    ]) {
      expect(() =>
        parseSendMessageBody({
          clientMessageId: id,
          body: 'hello',
          [extra]: 'smuggled',
        }),
      ).toThrow();
    }
  });

  it('validates list and history queries', () => {
    expect(parseConversationsListQuery({})).toEqual({
      page: 1,
      pageSize: 20,
      q: null,
    });
    expect(parseConversationsListQuery({ q: '  Ada  ' }).q).toBe('Ada');
    expect(() => parseConversationsListQuery({ page: ['1'] })).toThrow();
    expect(() => parseConversationsListQuery({ unknown: '1' })).toThrow();
    expect(() => parseConversationsListQuery({ q: 'x'.repeat(101) })).toThrow();
    expect(parseMessagesHistoryQuery({})).toEqual({
      before: null,
      limit: 50,
    });
    expect(parseMessagesHistoryQuery({ limit: '100' }).limit).toBe(100);
    expect(() => parseMessagesHistoryQuery({ limit: '0' })).toThrow();
    expect(() => parseMessagesHistoryQuery({ limit: '101' })).toThrow();
    expect(() => parseMessagesHistoryQuery({ limit: '-1' })).toThrow();
    expect(() => parseMessagesHistoryQuery({ limit: '1.5' })).toThrow();
    expect(() => parseMessagesHistoryQuery({ limit: 'abc' })).toThrow();
    expect(() => parseMessagesHistoryQuery({ limit: ['50', '50'] })).toThrow();
    expect(() => parseMessagesHistoryQuery({ before: ['m1'] })).toThrow();
    expect(() => parseMessagesHistoryQuery({ before: ['m1', 'm2'] })).toThrow();
    expect(() => parseMessagesHistoryQuery({ foo: '1' })).toThrow();
  });
});

describe('messaging events', () => {
  it('keeps conversation and message events free of private bodies', () => {
    const created = conversationCreatedEvent({
      conversationId: 'c1',
      requestId: 'r1',
      requesterId: 'u1',
      helperId: 'u2',
    });
    const sent = messageSentEvent({
      messageId: 'm1',
      conversationId: 'c1',
      senderId: 'u1',
      clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(created.type).toBe('conversation.created');
    expect(sent.type).toBe('message.sent');
    expect(eventHasPrivateBody(created)).toBe(false);
    expect(eventHasPrivateBody(sent)).toBe(false);
    expect(JSON.stringify(sent)).not.toContain('hello');
    expect(JSON.stringify(created)).not.toContain('headline');
  });
});

describe('messaging rate limiter', () => {
  it('uses hashed sender keys, fail-closes, and omits message bodies', async () => {
    const incrementFixedWindow = vi.fn().mockResolvedValue(1);
    const limiter = new MessagingRateLimiter(
      { incrementFixedWindow } as never,
      { hashRateLimitActor: () => 'hashed-actor' } as never,
    );
    await limiter.consumeNewMessage('user-1');
    expect(incrementFixedWindow).toHaveBeenCalledWith(
      'messaging-rate:v1:send:hashed-actor',
      60,
    );
    const key = limiter.keyForSender('user-1');
    expect(key).not.toContain('user-1');
    expect(key).not.toContain('secret body');
    expect(key).not.toMatch(/@/);

    incrementFixedWindow.mockResolvedValue(31);
    await expect(limiter.consumeNewMessage('user-1')).rejects.toMatchObject({
      code: MESSAGING_ERROR_CODES.rateLimited,
    });

    incrementFixedWindow.mockRejectedValue(new Error('redis down'));
    await expect(limiter.consumeNewMessage('user-1')).rejects.toBeInstanceOf(
      ApiError,
    );
    await expect(limiter.consumeNewMessage('user-1')).rejects.toMatchObject({
      code: MESSAGING_ERROR_CODES.rateLimited,
    });
  });
});

describe('messaging source privacy', () => {
  it('never writes lastReadAt and never logs private message bodies', () => {
    const service = readFileSync(
      resolve(__dirname, '../src/conversations/conversations.service.ts'),
      'utf8',
    );
    const limiter = readFileSync(
      resolve(__dirname, '../src/conversations/messaging-rate-limiter.ts'),
      'utf8',
    );
    const controller = readFileSync(
      resolve(__dirname, '../src/conversations/conversations.controller.ts'),
      'utf8',
    );
    expect(service).not.toMatch(/lastReadAt/);
    expect(service).not.toMatch(/console\.(log|debug|info|warn)/);
    expect(service).not.toMatch(/new Logger|this\.logger/);
    expect(limiter).not.toMatch(/email|displayName|headline|message body/);
    expect(service).toContain('DISTINCT ON');
    expect(service).not.toContain('whoCouldHelp');
    expect(controller).not.toMatch(/lastReadAt/);
    expect(
      messageSentEvent({
        messageId: 'm1',
        conversationId: 'c1',
        senderId: 'u1',
        clientMessageId: '550e8400-e29b-41d4-a716-446655440000',
      }),
    ).not.toHaveProperty('body');
  });
});
