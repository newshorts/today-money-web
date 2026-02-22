import type { PlaidItem, Transaction } from "@prisma/client";

import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { decryptSecret } from "@/lib/crypto";
import { getPlaidClient } from "@/lib/plaid";
import { defaultBudgetImpact } from "@/lib/classification";
import { dateOnlyToUtcNoon } from "@/lib/date";
import { dollarsToCents } from "@/lib/money";

export type SyncCounts = {
  syncedItems: number;
  added: number;
  modified: number;
  removed: number;
};

type ItemSyncCounts = {
  added: number;
  modified: number;
  removed: number;
};

type PlaidTransactionLike = {
  account_id?: string;
  transaction_id?: string;
  pending_transaction_id?: string | null;
  authorized_date?: string | null;
  date: string;
  amount: number;
  currency?: string;
  pending?: boolean;
  name?: string;
  merchant_name?: string | null;
  personal_finance_category?: {
    primary?: string;
    detailed?: string;
  };
  category?: string[];
  transaction_code?: string | null;
};

export async function syncAllItemsForUser(userId: string): Promise<SyncCounts> {
  const items = await prisma.plaidItem.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });

  let added = 0;
  let modified = 0;
  let removed = 0;

  for (const item of items) {
    const counts = await syncOneItem(item);
    added += counts.added;
    modified += counts.modified;
    removed += counts.removed;
  }

  return {
    syncedItems: items.length,
    added,
    modified,
    removed,
  };
}

export async function syncItemById(userId: string, itemId: string): Promise<ItemSyncCounts> {
  const item = await prisma.plaidItem.findFirst({
    where: { id: itemId, userId, status: "ACTIVE" },
  });

  if (!item) {
    throw new ApiError(404, "NOT_FOUND", "Plaid item not found");
  }

  return syncOneItem(item);
}

export async function syncItemByPlaidItemId(plaidItemId: string): Promise<void> {
  const item = await prisma.plaidItem.findFirst({
    where: { plaidItemId, status: "ACTIVE" },
  });

  if (!item) {
    return;
  }

  await syncOneItem(item);
}

async function syncOneItem(item: PlaidItem): Promise<ItemSyncCounts> {
  const client = getPlaidClient();
  const accessToken = decryptSecret(item.accessTokenEnc);

  let cursor = item.transactionsCursor ?? undefined;
  let hasMore = true;

  let added = 0;
  let modified = 0;
  let removed = 0;

  while (hasMore) {
    const response = await client.transactionsSync({
      access_token: accessToken,
      cursor,
      count: 500,
    });

    const data = response.data;

    for (const tx of data.added as PlaidTransactionLike[]) {
      await upsertPlaidTransaction(item.userId, item.id, tx);
    }

    for (const tx of data.modified as PlaidTransactionLike[]) {
      await upsertPlaidTransaction(item.userId, item.id, tx);
    }

    for (const removedTx of data.removed) {
      await markTransactionRemoved(item.userId, removedTx.transaction_id);
    }

    cursor = data.next_cursor;
    hasMore = data.has_more;

    added += data.added.length;
    modified += data.modified.length;
    removed += data.removed.length;
  }

  await prisma.plaidItem.update({
    where: { id: item.id },
    data: {
      transactionsCursor: cursor,
    },
  });

  return { added, modified, removed };
}

async function upsertPlaidTransaction(
  userId: string,
  itemId: string,
  tx: PlaidTransactionLike,
): Promise<void> {
  if (!tx.transaction_id) {
    return;
  }

  const amountCents = dollarsToCents(tx.amount);
  const date = dateOnlyToUtcNoon(tx.date);
  const authorizedDate = tx.authorized_date ? dateOnlyToUtcNoon(tx.authorized_date) : null;
  const effectiveDate = authorizedDate ?? date;

  const existing = await prisma.transaction.findUnique({
    where: { plaidTransactionId: tx.transaction_id },
  });

  const computedImpact = defaultBudgetImpact(tx, amountCents);
  const budgetImpact = existing?.userOverrideImpact ? existing.budgetImpact : computedImpact;
  const isHidden = existing?.userOverrideImpact ? existing.isHidden : existing?.isHidden ?? false;

  const baseData = {
    userId,
    source: "PLAID" as const,
    itemId,
    accountId: tx.account_id ?? null,
    plaidTransactionId: tx.transaction_id,
    date,
    authorizedDate,
    effectiveDate,
    amountCents,
    currency: "USD",
    pending: tx.pending ?? false,
    pendingTransactionId: tx.pending_transaction_id ?? null,
    isRemovedByPlaid: false,
    budgetImpact,
    userOverrideImpact: existing?.userOverrideImpact ?? false,
    isHidden,
    hiddenReason: isHidden ? existing?.hiddenReason ?? "USER" : null,
    name: tx.name || "Unknown transaction",
    merchantName: tx.merchant_name ?? null,
    categoryPrimary: tx.personal_finance_category?.primary ?? null,
    categoryDetailed: tx.personal_finance_category?.detailed ?? null,
    userNote: existing?.userNote ?? null,
  };

  let current: Transaction;

  if (existing) {
    current = await prisma.transaction.update({
      where: { id: existing.id },
      data: baseData,
    });
  } else {
    current = await prisma.transaction.create({
      data: {
        ...baseData,
        isSuperseded: false,
      },
    });
  }

  if (current.pendingTransactionId) {
    await prisma.transaction.updateMany({
      where: {
        userId,
        plaidTransactionId: current.pendingTransactionId,
      },
      data: {
        isSuperseded: true,
        isHidden: true,
        hiddenReason: "SUPERSEDED",
      },
    });
  }
}

async function markTransactionRemoved(userId: string, plaidTransactionId: string): Promise<void> {
  const existing = await prisma.transaction.findUnique({
    where: { plaidTransactionId },
  });

  if (!existing || existing.userId !== userId) {
    return;
  }

  const shouldHide = existing.userOverrideImpact ? existing.isHidden : true;

  await prisma.transaction.update({
    where: { id: existing.id },
    data: {
      isRemovedByPlaid: true,
      isHidden: shouldHide,
      hiddenReason: shouldHide ? "PLAID_REMOVED" : existing.hiddenReason,
    },
  });
}
