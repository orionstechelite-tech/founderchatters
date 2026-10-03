import { Inject, Injectable } from '@nestjs/common';

export const NOTIFICATION_EMAIL_DELIVERY = Symbol(
  'NOTIFICATION_EMAIL_DELIVERY',
);

export type NotificationEmail = {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
};

export interface NotificationEmailDelivery {
  send(message: NotificationEmail): Promise<void>;
}

@Injectable()
export class InMemoryNotificationEmailDelivery implements NotificationEmailDelivery {
  private readonly messages: NotificationEmail[] = [];

  async send(message: NotificationEmail): Promise<void> {
    this.messages.push(structuredClone(message));
  }

  getMessages(): readonly NotificationEmail[] {
    return structuredClone(this.messages);
  }

  clear(): void {
    this.messages.length = 0;
  }
}

@Injectable()
export class NotificationEmailService {
  constructor(
    @Inject(NOTIFICATION_EMAIL_DELIVERY)
    private readonly delivery: NotificationEmailDelivery,
  ) {}

  async send(message: NotificationEmail): Promise<void> {
    await this.delivery.send(message);
  }
}
