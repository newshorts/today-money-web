import { NextResponse } from "next/server";

import { patchTransactionSchema } from "@/contracts/schemas";
import { defaultBudgetImpact } from "@/lib/classification";
import { prisma } from "@/lib/db";
import { ApiError, toErrorResponse } from "@/lib/errors";
import { parseJson, requireAuth } from "@/lib/http";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const auth = await requireAuth(req);
    const { id } = await context.params;
    const body = await parseJson(req, patchTransactionSchema);

    const tx = await prisma.transaction.findFirst({
      where: {
        id,
        userId: auth.userId,
      },
    });

    if (!tx) {
      throw new ApiError(404, "NOT_FOUND", "Transaction not found");
    }

    if (tx.budgetImpact === "TRANSFER_EXCLUDED" && body.budgetImpact && body.budgetImpact !== "TRANSFER_EXCLUDED") {
      throw new ApiError(400, "INVALID_REQUEST", "Transfers must remain excluded");
    }

    const isUserChange =
      body.budgetImpact !== undefined || body.isHidden !== undefined || body.userNote !== undefined;

    const userOverrideImpact = body.userOverrideImpact ?? (isUserChange ? true : tx.userOverrideImpact);

    let budgetImpact = body.budgetImpact ?? tx.budgetImpact;
    let isHidden = body.isHidden ?? tx.isHidden;
    let hiddenReason: "USER" | null = isHidden ? "USER" : null;

    if (!userOverrideImpact) {
      if (tx.source === "PLAID") {
        budgetImpact = defaultBudgetImpact(
          {
            amount: Number(tx.amountCents) / 100,
            transaction_code: null,
            personal_finance_category: {
              primary: tx.categoryPrimary ?? undefined,
            },
            category: tx.categoryPrimary ? [tx.categoryPrimary] : [],
          },
          tx.amountCents,
        );
      } else {
        budgetImpact = tx.amountCents < 0n ? "INCOME_EXCLUDED" : "VARIABLE";
      }

      isHidden = false;
      hiddenReason = null;
    }

    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        budgetImpact,
        userOverrideImpact,
        isHidden,
        hiddenReason,
        userNote: body.userNote ?? tx.userNote,
      },
    });

    return NextResponse.json({ status: "OK" });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const auth = await requireAuth(req);
    const { id } = await context.params;

    const tx = await prisma.transaction.findFirst({
      where: {
        id,
        userId: auth.userId,
      },
    });

    if (!tx) {
      throw new ApiError(404, "NOT_FOUND", "Transaction not found");
    }

    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        isHidden: true,
        hiddenReason: "USER",
        budgetImpact: "USER_EXCLUDED",
        userOverrideImpact: true,
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
