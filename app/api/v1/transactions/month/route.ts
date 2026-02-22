import { DateTime } from "luxon";
import { NextResponse } from "next/server";

import { monthQuerySchema } from "@/contracts/schemas";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { serializeTransaction } from "@/lib/budget";
import { prisma } from "@/lib/db";
import { ApiError, toErrorResponse } from "@/lib/errors";
import { requireAuth } from "@/lib/http";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const params = new URL(req.url).searchParams;

    const parsed = monthQuerySchema.safeParse({
      year: params.get("year"),
      month: params.get("month"),
      includeHidden: params.get("includeHidden") ?? undefined,
    });

    if (!parsed.success) {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid month query", {
        issues: parsed.error.issues,
      });
    }

    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    const timezone = user?.timezone || DEFAULT_TIMEZONE;

    const start = DateTime.fromObject(
      { year: parsed.data.year, month: parsed.data.month, day: 1 },
      { zone: timezone },
    ).startOf("month");
    const end = start.endOf("month");

    const transactions = await prisma.transaction.findMany({
      where: {
        userId: auth.userId,
        effectiveDate: {
          gte: start.toUTC().toJSDate(),
          lte: end.toUTC().toJSDate(),
        },
        ...(parsed.data.includeHidden ? {} : { isHidden: false }),
      },
      orderBy: { effectiveDate: "asc" },
    });

    return NextResponse.json({
      year: parsed.data.year,
      month: parsed.data.month,
      currency: "USD",
      transactions: transactions.map((tx) => serializeTransaction(tx, timezone)),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
