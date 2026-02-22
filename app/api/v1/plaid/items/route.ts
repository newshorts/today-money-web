import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { toErrorResponse } from "@/lib/errors";
import { requireAuth } from "@/lib/http";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);

    const items = await prisma.plaidItem.findMany({
      where: { userId: auth.userId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      items: items.map((item) => ({
        id: item.id,
        institutionName: item.institutionName ?? "Unknown institution",
        status: item.status,
        createdAt: item.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
