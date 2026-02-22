import { NextResponse } from "next/server";

import { manualTransactionSchema } from "@/contracts/schemas";
import { dateOnlyToUtcNoon } from "@/lib/date";
import { prisma } from "@/lib/db";
import { toErrorResponse } from "@/lib/errors";
import { parseJson, requireAuth } from "@/lib/http";
import { usdCurrencyOrThrow } from "@/lib/money";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await parseJson(req, manualTransactionSchema);

    usdCurrencyOrThrow(body.currency);

    const effectiveDate = dateOnlyToUtcNoon(body.effectiveDate);

    const tx = await prisma.transaction.create({
      data: {
        userId: auth.userId,
        source: "MANUAL",
        itemId: null,
        accountId: null,
        plaidTransactionId: null,
        date: effectiveDate,
        authorizedDate: null,
        effectiveDate,
        amountCents: BigInt(body.amountCents),
        currency: "USD",
        pending: false,
        pendingTransactionId: null,
        isSuperseded: false,
        isRemovedByPlaid: false,
        budgetImpact: body.amountCents < 0 ? "INCOME_EXCLUDED" : "VARIABLE",
        userOverrideImpact: false,
        isHidden: false,
        hiddenReason: null,
        name: body.name,
        merchantName: null,
        categoryPrimary: null,
        categoryDetailed: null,
        userNote: null,
      },
    });

    return NextResponse.json({ id: tx.id });
  } catch (error) {
    return toErrorResponse(error);
  }
}
