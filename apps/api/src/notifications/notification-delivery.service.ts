import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import { NOTIFICATION_TYPES } from '@founderchatters/contracts';
import type { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../database/prisma.service.js';
import { NotificationEmailService } from './notification-email.service.js';

const DELIVERY_BATCH_SIZE = 25;
const WORKER_IDLE_MS = 5_000;
const RETRY_ONE_MS = 60_000;
const RETRY_TWO_MS = 300_000;
const MAX_ATTEMPTS = 3;

const deliverySelect = {
  id: true,
  status: true,
  attemptCount: true,
  templateVersion: true,
  updatedAt: true,
  notification: {
    select: {
      type: true,
      title: true,
      body: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  },
} satisfies Prisma.NotificationDeliverySelect;

type StoredDelivery = Prisma.NotificationDeliveryGetPayload<{
  select: typeof deliverySelect;
}>;

class DeliveryJobError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'DeliveryJobError';
  }
}

@Injectable()
export class NotificationDeliveryService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(NotificationEmailService)
    private readonly email: NotificationEmailService,
  ) {}

  async processBatch(now = new Date()): Promise<number> {
    await this.failAbandonedExhausted(now);

    const retryOneBefore = new Date(now.getTime() - RETRY_ONE_MS);
    const retryTwoBefore = new Date(now.getTime() - RETRY_TWO_MS);

    const rows = await this.prisma.notificationDelivery.findMany({
      where: {
        channel: 'EMAIL',
        OR: [
          { status: 'QUEUED', attemptCount: 0 },
          {
            status: 'QUEUED',
            attemptCount: 1,
            updatedAt: { lte: retryOneBefore },
          },
          {
            status: 'QUEUED',
            attemptCount: 2,
            updatedAt: { lte: retryTwoBefore },
          },
          {
            status: 'RETRY_QUEUED',
            attemptCount: 1,
            updatedAt: { lte: retryOneBefore },
          },
          {
            status: 'RETRY_QUEUED',
            attemptCount: 2,
            updatedAt: { lte: retryTwoBefore },
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: DELIVERY_BATCH_SIZE,
      select: deliverySelect,
    });

    let processed = 0;

    for (const row of rows) {
      const claimed = await this.prisma.notificationDelivery.updateMany({
        where: {
          id: row.id,
          status: row.status,
          attemptCount: row.attemptCount,
          updatedAt: row.updatedAt,
        },
        data: {
          attemptCount: {
            increment: 1,
          },
          lastErrorCode: null,
        },
      });

      if (claimed.count !== 1) {
        continue;
      }

      processed += 1;
      const attempt = row.attemptCount + 1;

      try {
        await this.deliver(row);

        await this.prisma.notificationDelivery.update({
          where: { id: row.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            lastErrorCode: null,
          },
        });
      } catch (error) {
        await this.prisma.notificationDelivery.update({
          where: { id: row.id },
          data: {
            status: attempt >= MAX_ATTEMPTS ? 'FAILED' : 'RETRY_QUEUED',
            lastErrorCode: this.errorCode(error),
          },
        });
      }
    }

    return processed;
  }

  private async deliver(row: StoredDelivery): Promise<void> {
    const templateKey = this.templateKey(row.notification.type);

    const template = await this.prisma.notificationTemplate.findUnique({
      where: {
        key_version: {
          key: templateKey,
          version: row.templateVersion,
        },
      },
      select: {
        subject: true,
        body: true,
        isActive: true,
      },
    });

    if (!template?.isActive) {
      throw new DeliveryJobError('TEMPLATE_UNAVAILABLE');
    }

    const variables = {
      title: row.notification.title,
      body: row.notification.body ?? '',
    };

    await this.email.send({
      to: row.notification.user.email,
      subject: this.render(
        template.subject ?? row.notification.title,
        variables,
      ),
      body: this.render(template.body, variables),
    });
  }

  private templateKey(notificationType: string): string {
    if (
      notificationType === NOTIFICATION_TYPES.applicationNeedsInfo ||
      notificationType === NOTIFICATION_TYPES.applicationApproved ||
      notificationType === NOTIFICATION_TYPES.applicationRejected
    ) {
      return 'application-status';
    }

    throw new DeliveryJobError('UNSUPPORTED_NOTIFICATION_TYPE');
  }

  private render(
    template: string,
    values: { title: string; body: string },
  ): string {
    return template
      .replaceAll('{{title}}', values.title)
      .replaceAll('{{body}}', values.body);
  }

  private errorCode(error: unknown): string {
    return error instanceof DeliveryJobError ? error.code : 'DELIVERY_FAILED';
  }

  private async failAbandonedExhausted(now: Date): Promise<void> {
    const exhaustedBefore = new Date(now.getTime() - RETRY_TWO_MS);

    await this.prisma.notificationDelivery.updateMany({
      where: {
        channel: 'EMAIL',
        status: {
          in: ['QUEUED', 'RETRY_QUEUED'],
        },
        attemptCount: {
          gte: MAX_ATTEMPTS,
        },
        updatedAt: {
          lte: exhaustedBefore,
        },
      },
      data: {
        status: 'FAILED',
        lastErrorCode: 'DELIVERY_ATTEMPT_INTERRUPTED',
      },
    });
  }
}

@Injectable()
export class NotificationDeliveryWorker implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationDeliveryWorker.name);
  private stopping = false;

  constructor(
    @Inject(NotificationDeliveryService)
    private readonly deliveries: NotificationDeliveryService,
  ) {}

  async run(): Promise<void> {
    while (!this.stopping) {
      try {
        const processed = await this.deliveries.processBatch();
        if (processed === 0) {
          await this.sleep(WORKER_IDLE_MS);
        }
      } catch {
        this.logger.error({
          event: 'notification_delivery_batch_failed',
        });
        await this.sleep(WORKER_IDLE_MS);
      }
    }
  }

  onModuleDestroy(): void {
    this.stopping = true;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
