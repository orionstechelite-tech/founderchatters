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
  private sendGate: ((message: NotificationEmail) => Promise<void>) | null =
    null;

  async send(message: NotificationEmail): Promise<void> {
    if (this.sendGate) {
      await this.sendGate(message);
    }
    this.messages.push(structuredClone(message));
  }

  getMessages(): readonly NotificationEmail[] {
    return structuredClone(this.messages);
  }

  deferSend(): {
    started: Promise<NotificationEmail>;
    release: () => void;
  } {
    let started!: (message: NotificationEmail) => void;
    let release!: () => void;
    const startedPromise = new Promise<NotificationEmail>((resolve) => {
      started = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.sendGate = async (message) => {
      started(message);
      await held;
    };
    return {
      started: startedPromise,
      release: () => release(),
    };
  }

  clear(): void {
    this.messages.length = 0;
    this.sendGate = null;
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
