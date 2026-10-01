import type { HelpOutcome, ResponseType } from '@founderchatters/contracts';

export type HelpConfirmedEvent = {
  type: 'help.confirmed';
  helpConfirmationId: string;
  requestId: string;
  confirmerId: string;
  helperId: string;
  responseId: string;
  outcome: HelpOutcome;
  responseType: ResponseType;
};

export type ContributionCreatedEvent = {
  type: 'contribution.created';
  contributionId: string;
  helpConfirmationId: string;
  contributorId: string;
  requestId: string;
  responseType: ResponseType;
  topicCount: number;
};

export type HelpConfirmationDomainEvent =
  HelpConfirmedEvent | ContributionCreatedEvent;

const captured: HelpConfirmationDomainEvent[] = [];

export function helpConfirmedEvent(input: {
  helpConfirmationId: string;
  requestId: string;
  confirmerId: string;
  helperId: string;
  responseId: string;
  outcome: HelpOutcome;
  responseType: ResponseType;
}): HelpConfirmedEvent {
  return {
    type: 'help.confirmed',
    helpConfirmationId: input.helpConfirmationId,
    requestId: input.requestId,
    confirmerId: input.confirmerId,
    helperId: input.helperId,
    responseId: input.responseId,
    outcome: input.outcome,
    responseType: input.responseType,
  };
}

export function contributionCreatedEvent(input: {
  contributionId: string;
  helpConfirmationId: string;
  contributorId: string;
  requestId: string;
  responseType: ResponseType;
  topicCount: number;
}): ContributionCreatedEvent {
  return {
    type: 'contribution.created',
    contributionId: input.contributionId,
    helpConfirmationId: input.helpConfirmationId,
    contributorId: input.contributorId,
    requestId: input.requestId,
    responseType: input.responseType,
    topicCount: input.topicCount,
  };
}

export function emitHelpConfirmationEvent(
  event: HelpConfirmationDomainEvent,
): void {
  captured.push(event);
}

export function takeHelpConfirmationEvents(): HelpConfirmationDomainEvent[] {
  const copy = [...captured];
  captured.length = 0;
  return copy;
}

export function eventHasPrivateContent(
  event: HelpConfirmationDomainEvent,
): boolean {
  const raw = JSON.stringify(event);
  return (
    /body|headline|personName|reason|email|message/i.test(
      Object.keys(event).join(' '),
    ) || /"body"|"headline"|"personName"|"reason"/.test(raw)
  );
}
