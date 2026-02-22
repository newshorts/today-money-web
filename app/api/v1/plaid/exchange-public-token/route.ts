import { NextResponse } from "next/server";

import { exchangePublicTokenSchema } from "@/contracts/schemas";
import { encryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { ApiError, toErrorResponse } from "@/lib/errors";
import { parseJson, requireAuth } from "@/lib/http";
import { getPlaidClient } from "@/lib/plaid";
import { refreshRecurringForUser } from "@/lib/recurring";
import { syncItemById } from "@/lib/sync";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await parseJson(req, exchangePublicTokenSchema);
    const plaid = getPlaidClient();

    const exchange = await plaid.itemPublicTokenExchange({
      public_token: body.publicToken,
    });

    const plaidItemId = exchange.data.item_id;
    const encryptedAccessToken = encryptSecret(exchange.data.access_token);

    const existing = await prisma.plaidItem.findUnique({
      where: { plaidItemId },
    });

    if (existing && existing.userId !== auth.userId) {
      throw new ApiError(409, "CONFLICT", "Plaid item is already linked to another user");
    }

    const item = existing
      ? await prisma.plaidItem.update({
          where: { id: existing.id },
          data: {
            accessTokenEnc: encryptedAccessToken,
            institutionId: body.metadata?.institutionId ?? existing.institutionId,
            institutionName: body.metadata?.institutionName ?? existing.institutionName,
            status: "ACTIVE",
          },
        })
      : await prisma.plaidItem.create({
          data: {
            userId: auth.userId,
            plaidItemId,
            accessTokenEnc: encryptedAccessToken,
            institutionId: body.metadata?.institutionId,
            institutionName: body.metadata?.institutionName,
            status: "ACTIVE",
          },
        });

    try {
      await syncItemById(auth.userId, item.id);
    } catch (error) {
      console.error("Initial sync failed", error);
    }

    try {
      await refreshRecurringForUser(auth.userId);
    } catch (error) {
      console.error("Recurring refresh failed", error);
    }

    return NextResponse.json({ status: "OK" });
  } catch (error) {
    return toErrorResponse(error);
  }
}
