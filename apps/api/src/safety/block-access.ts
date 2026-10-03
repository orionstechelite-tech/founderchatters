import type { Prisma } from '../../../../generated/prisma/client.js';

import type { PrismaService } from '../database/prisma.service.js';

export type BlockLookupClient = Prisma.TransactionClient | PrismaService;

export async function areMembersBlocked(
  tx: BlockLookupClient,
  leftId: string,
  rightId: string,
): Promise<boolean> {
  if (leftId === rightId) return false;
  const row = await tx.block.findFirst({
    where: {
      OR: [
        { blockerId: leftId, blockedId: rightId },
        { blockerId: rightId, blockedId: leftId },
      ],
    },
    select: { blockerId: true },
  });
  return Boolean(row);
}
