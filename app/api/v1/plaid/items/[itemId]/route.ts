import { NextResponse } from "next/server";

import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { ApiError, toErrorResponse } from "@/lib/errors";
import { requireAuth } from "@/lib/http";
import { getPlaidClient } from "@/lib/plaid";

type RouteContext = {
  params: Promise<{ itemId: string }>;
};

export async function DELETE(req: Request, context: RouteContext) {
  try {
    const auth = await requireAuth(req);
    const { itemId } = await context.params;

    const item = await prisma.plaidItem.findFirst({
      where: {
        id: itemId,
        userId: auth.userId,
      },
    });

    if (!item) {
      throw new ApiError(404, "NOT_FOUND", "Plaid item not found");
    }

    const plaid = getPlaidClient();
    const accessToken = decryptSecret(item.accessTokenEnc);

    await plaid.itemRemove({
      access_token: accessToken,
    });

    await prisma.plaidItem.update({
      where: { id: item.id },
      data: { status: "DISCONNECTED" },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
