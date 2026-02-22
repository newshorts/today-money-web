import type { PlaidItem, StreamDirection, StreamFrequency } from "@prisma/client";

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { getPlaidClient } from "@/lib/plaid";
import { dateOnlyToUtcNoon } from "@/lib/date";
import { dollarsToCents } from "@/lib/money";

type RecurringStreamLike = {
  stream_id: string;
  description: string;
  merchant_name?: string | null;
  frequency: string;
  average_amount?: number | { amount?: number | string } | null;
  last_amount?: number | { amount?: number | string } | null;
  is_active?: boolean;
  predicted_next_date?: string | null;
  transaction_ids?: string[];
};

export async function refreshRecurringForUser(userId: string): Promise<void> {
  const items = await prisma.plaidItem.findMany({
    where: { userId, status: "ACTIVE" },
  });

  for (const item of items) {
    try {
      await refreshRecurringForItem(item);
    } catch (error) {
      console.error("Recurring refresh failed for item", item.id, error);
    }
  }
}

export async function refreshRecurringForPlaidItemId(plaidItemId: string): Promise<void> {
  const item = await prisma.plaidItem.findFirst({
    where: { plaidItemId, status: "ACTIVE" },
  });

  if (!item) {
    return;
  }

  await refreshRecurringForItem(item);
}

export async function getBudgetSuggestions(userId: string): Promise<{
  available: boolean;
  currency: "USD";
  suggestedIncomeMonthlyCents: number;
  suggestedFixedMonthlyCents: number;
}> {
  const activeItemCount = await prisma.plaidItem.count({
    where: { userId, status: "ACTIVE" },
  });

  if (activeItemCount === 0) {
    return {
      available: false,
      currency: "USD",
      suggestedIncomeMonthlyCents: 0,
      suggestedFixedMonthlyCents: 0,
    };
  }

  await refreshRecurringForUser(userId);

  const streams = await prisma.plaidRecurringStream.findMany({
    where: { userId, isActive: true },
  });

  let income = 0n;
  let fixed = 0n;

  for (const stream of streams) {
    const amount = stream.userAmountOverrideCents ?? stream.avgAmountCents;
    const monthly = monthlyEquivalent(amount, stream.frequency);

    if (stream.direction === "INFLOW" && stream.countsTowardIncome) {
      income += monthly;
    }

    if (stream.direction === "OUTFLOW" && stream.countsTowardFixed) {
      fixed += monthly;
    }
  }

  return {
    available: true,
    currency: "USD",
    suggestedIncomeMonthlyCents: Number(income),
    suggestedFixedMonthlyCents: Number(fixed),
  };
}

async function refreshRecurringForItem(item: PlaidItem): Promise<void> {
  const client = getPlaidClient();
  const accessToken = decryptSecret(item.accessTokenEnc);

  const response = await client.transactionsRecurringGet({
    access_token: accessToken,
  });

  const inflows = (response.data.inflow_streams || []) as unknown as RecurringStreamLike[];
  const outflows = (response.data.outflow_streams || []) as unknown as RecurringStreamLike[];

  const seen = new Set<string>();

  for (const stream of inflows) {
    await upsertStream(item, stream, "INFLOW");
    seen.add(stream.stream_id);
    await mapStreamTransactions(item.userId, stream, "INFLOW");
  }

  for (const stream of outflows) {
    await upsertStream(item, stream, "OUTFLOW");
    seen.add(stream.stream_id);
    await mapStreamTransactions(item.userId, stream, "OUTFLOW");
  }

  if (seen.size > 0) {
    await prisma.plaidRecurringStream.updateMany({
      where: {
        itemId: item.id,
        plaidStreamId: {
          notIn: [...seen],
        },
      },
      data: {
        isActive: false,
      },
    });
  }
}

async function upsertStream(
  item: PlaidItem,
  stream: RecurringStreamLike,
  direction: StreamDirection,
): Promise<void> {
  const frequency = mapFrequency(stream.frequency);
  const avgAmountCents = dollarsToCents(normalizeStreamAmount(stream.average_amount));
  const lastAmountCents = dollarsToCents(normalizeStreamAmount(stream.last_amount));

  await prisma.plaidRecurringStream.upsert({
    where: { plaidStreamId: stream.stream_id },
    create: {
      userId: item.userId,
      itemId: item.id,
      plaidStreamId: stream.stream_id,
      direction,
      description: stream.description || "Recurring stream",
      merchantName: stream.merchant_name ?? null,
      frequency,
      avgAmountCents,
      lastAmountCents,
      predictedNextDate: stream.predicted_next_date
        ? dateOnlyToUtcNoon(stream.predicted_next_date)
        : null,
      isActive: stream.is_active ?? true,
      countsTowardIncome: direction === "INFLOW",
      countsTowardFixed: direction === "OUTFLOW",
    },
    update: {
      direction,
      description: stream.description || "Recurring stream",
      merchantName: stream.merchant_name ?? null,
      frequency,
      avgAmountCents,
      lastAmountCents,
      predictedNextDate: stream.predicted_next_date
        ? dateOnlyToUtcNoon(stream.predicted_next_date)
        : null,
      isActive: stream.is_active ?? true,
    },
  });
}

async function mapStreamTransactions(
  userId: string,
  stream: RecurringStreamLike,
  direction: StreamDirection,
): Promise<void> {
  const ids = (stream.transaction_ids || []).filter(Boolean);
  if (ids.length === 0) {
    return;
  }

  await prisma.transaction.updateMany({
    where: {
      userId,
      plaidTransactionId: { in: ids },
      userOverrideImpact: false,
    },
    data: {
      budgetImpact: direction === "OUTFLOW" ? "FIXED_EXCLUDED" : "INCOME_EXCLUDED",
    },
  });
}

function mapFrequency(value: string | undefined): StreamFrequency {
  const normalized = (value || "").toUpperCase();

  if (normalized === "WEEKLY") return "WEEKLY";
  if (normalized === "BIWEEKLY") return "BIWEEKLY";
  if (normalized === "SEMI_MONTHLY") return "SEMI_MONTHLY";
  if (normalized === "MONTHLY") return "MONTHLY";
  if (normalized === "ANNUALLY") return "ANNUALLY";

  return "UNKNOWN";
}

export function monthlyEquivalent(amountCents: bigint, frequency: StreamFrequency): bigint {
  const amount = Number(amountCents);

  switch (frequency) {
    case "MONTHLY":
      return amountCents;
    case "SEMI_MONTHLY":
      return BigInt(Math.round(amount * 2));
    case "BIWEEKLY":
      return BigInt(Math.round((amount * 26) / 12));
    case "WEEKLY":
      return BigInt(Math.round((amount * 52) / 12));
    case "ANNUALLY":
      return BigInt(Math.round(amount / 12));
    default:
      return 0n;
  }
}

function normalizeStreamAmount(value: number | { amount?: number | string } | null | undefined): number {
  if (typeof value === "number") {
    return value;
  }

  if (value && typeof value === "object") {
    if (typeof value.amount === "number") {
      return value.amount;
    }

    if (typeof value.amount === "string") {
      const parsed = Number(value.amount);
      return Number.isFinite(parsed) ? parsed : 0;
    }
  }

  return 0;
}
