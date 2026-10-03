import { Inject, Injectable } from '@nestjs/common';
import {
  type MarkAllNotificationsReadResponse,
  type MarkNotificationReadResponse,
  type MemberNotification,
  type MemberNotificationsResponse,
  type NotificationType,
} from '@founderchatters/contracts';
import type { Prisma } from '../../../../generated/prisma/client.js';

import { PrismaService } from '../database/prisma.service.js';
import {
  notificationInvalidInput,
  notificationNotFound,
  parseNotificationId,
  parseNotificationsListQuery,
} from './notifications-query.js';

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  href: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

type StoredNotification = Prisma.NotificationGetPayload<{
  select: typeof notificationSelect;
}>;

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
  ) {}

  async list(
    callerId: string,
    query: Record<string, unknown>,
  ): Promise<MemberNotificationsResponse> {
    const parsed = parseNotificationsListQuery(query);

    let cursor: { createdAt: Date; id: string } | null = null;

    if (parsed.before) {
      const anchor = await this.prisma.notification.findUnique({
        where: { id: parsed.before },
        select: {
          id: true,
          userId: true,
          createdAt: true,
        },
      });

      if (!anchor || anchor.userId !== callerId) {
        throw notificationInvalidInput(
          { before: ['Choose a valid notification.'] },
          'Review the notification request and try again.',
        );
      }

      cursor = {
        createdAt: anchor.createdAt,
        id: anchor.id,
      };
    }

    const rows = await this.prisma.notification.findMany({
      where: {
        userId: callerId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                {
                  AND: [
                    { createdAt: cursor.createdAt },
                    { id: { lt: cursor.id } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: parsed.limit + 1,
      select: notificationSelect,
    });

    const hasMore = rows.length > parsed.limit;
    const window = hasMore ? rows.slice(0, parsed.limit) : rows;
    const notifications = window.map((row) => this.toNotification(row));

    return {
      notifications,
      nextBefore:
        hasMore && notifications.length > 0
          ? notifications[notifications.length - 1]!.id
          : null,
    };
  }

  async markRead(
    callerId: string,
    rawId: unknown,
  ): Promise<MarkNotificationReadResponse> {
    const id = parseNotificationId(rawId);

    const existing = await this.prisma.notification.findFirst({
      where: {
        id,
        userId: callerId,
      },
      select: notificationSelect,
    });

    if (!existing) {
      throw notificationNotFound();
    }

    if (existing.readAt) {
      return {
        notification: this.toNotification(existing),
      };
    }

    await this.prisma.notification.updateMany({
      where: {
        id,
        userId: callerId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    const updated = await this.prisma.notification.findFirst({
      where: {
        id,
        userId: callerId,
      },
      select: notificationSelect,
    });

    if (!updated) {
      throw notificationNotFound();
    }

    return {
      notification: this.toNotification(updated),
    };
  }

  async markAllRead(
    callerId: string,
  ): Promise<MarkAllNotificationsReadResponse> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId: callerId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return {
      updatedCount: result.count,
    };
  }

  private toNotification(row: StoredNotification): MemberNotification {
    return {
      id: row.id,
      type: row.type as NotificationType,
      title: row.title,
      body: row.body,
      href: row.href,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
