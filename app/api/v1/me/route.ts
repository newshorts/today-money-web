import { IANAZone } from "luxon";
import { NextResponse } from "next/server";

import { patchMeSchema } from "@/contracts/schemas";
import { prisma } from "@/lib/db";
import { ApiError, toErrorResponse } from "@/lib/errors";
import { parseJson, requireAuth } from "@/lib/http";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);

    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user) {
      throw new ApiError(404, "NOT_FOUND", "User not found");
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      timezone: user.timezone,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth(req);
    const body = await parseJson(req, patchMeSchema);

    if (!IANAZone.isValidZone(body.timezone)) {
      throw new ApiError(400, "INVALID_REQUEST", "timezone must be a valid IANA timezone");
    }

    const user = await prisma.user.update({
      where: { id: auth.userId },
      data: { timezone: body.timezone },
    });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      timezone: user.timezone,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
