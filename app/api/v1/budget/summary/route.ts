import { NextResponse } from "next/server";

import { computeBudgetSummary } from "@/lib/budget";
import { toErrorResponse } from "@/lib/errors";
import { requireAuth } from "@/lib/http";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const summary = await computeBudgetSummary(auth.userId);

    return NextResponse.json(summary);
  } catch (error) {
    return toErrorResponse(error);
  }
}
