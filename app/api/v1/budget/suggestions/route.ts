import { NextResponse } from "next/server";

import { toErrorResponse } from "@/lib/errors";
import { requireAuth } from "@/lib/http";
import { getBudgetSuggestions } from "@/lib/recurring";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const suggestions = await getBudgetSuggestions(auth.userId);

    return NextResponse.json(suggestions);
  } catch (error) {
    return toErrorResponse(error);
  }
}
