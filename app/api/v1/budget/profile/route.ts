import { NextResponse } from "next/server";

import { putBudgetProfileSchema } from "@/contracts/schemas";
import {
  budgetProfileToResponse,
  getOrCreateBudgetProfile,
  setBudgetProfile,
} from "@/lib/budget";
import { toErrorResponse } from "@/lib/errors";
import { parseJson, requireAuth } from "@/lib/http";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    const profile = await getOrCreateBudgetProfile(auth.userId);

    return NextResponse.json(budgetProfileToResponse(profile));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await parseJson(req, putBudgetProfileSchema);

    const profile = await setBudgetProfile(auth.userId, body);

    return NextResponse.json(budgetProfileToResponse(profile));
  } catch (error) {
    return toErrorResponse(error);
  }
}
