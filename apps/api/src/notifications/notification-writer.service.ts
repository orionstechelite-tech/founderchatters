import { Inject, Injectable } from '@nestjs/common';
import { type NotificationType } from '@founderchatters/contracts';
import type { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../database/prisma.service.js';

type NotificationDatabase = Prisma.TransactionClient | PrismaService;

export type PersistNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  delivery?: {
    channel: string;
    templateVersion: string;
  } | null;
};

@Injectable()
export class NotificationWriterService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async create(
    input: PersistNotificationInput,
    db: NotificationDatabase = this.prisma,
  ): Promise<{ id: string }> {
    return db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        href: input.href ?? null,
        ...(input.delivery
          ? {
              deliveries: {
                create: {
                  channel: input.delivery.channel,
                  templateVersion: input.delivery.templateVersion,
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });
  }
}
