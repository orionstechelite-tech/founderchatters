export type ConversationCreatedEvent = {
  type: 'conversation.created';
  conversationId: string;
  requestId: string;
  requesterId: string;
  helperId: string;
};

export type MessageSentEvent = {
  type: 'message.sent';
  messageId: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
};

export function conversationCreatedEvent(input: {
  conversationId: string;
  requestId: string;
  requesterId: string;
  helperId: string;
}): ConversationCreatedEvent {
  return {
    type: 'conversation.created',
    conversationId: input.conversationId,
    requestId: input.requestId,
    requesterId: input.requesterId,
    helperId: input.helperId,
  };
}

export function messageSentEvent(input: {
  messageId: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
}): MessageSentEvent {
  return {
    type: 'message.sent',
    messageId: input.messageId,
    conversationId: input.conversationId,
    senderId: input.senderId,
    clientMessageId: input.clientMessageId,
  };
}

export function eventHasPrivateBody(
  event: ConversationCreatedEvent | MessageSentEvent,
): boolean {
  return Object.keys(event).some((key) =>
    /body|headline|email|text/i.test(key),
  );
}
