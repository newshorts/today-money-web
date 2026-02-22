import type { BudgetImpact } from "@prisma/client";

export type PlaidLikeTransaction = {
  amount: number;
  personal_finance_category?: {
    primary?: string;
  };
  transaction_code?: string | null;
  category?: string[];
};

export function isTransferLike(tx: PlaidLikeTransaction): boolean {
  const primary = tx.personal_finance_category?.primary?.toUpperCase();
  if (primary === "TRANSFER_IN" || primary === "TRANSFER_OUT") {
    return true;
  }

  if ((tx.transaction_code || "").toLowerCase() === "transfer") {
    return true;
  }

  return (tx.category || []).some((part) => part.toLowerCase().includes("transfer"));
}

export function defaultBudgetImpact(tx: PlaidLikeTransaction, amountCents: bigint): BudgetImpact {
  if (isTransferLike(tx)) {
    return "TRANSFER_EXCLUDED";
  }

  if (amountCents < 0n) {
    return "INCOME_EXCLUDED";
  }

  return "VARIABLE";
}
