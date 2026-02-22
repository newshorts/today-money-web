import { NextResponse } from "next/server";

import { refreshSchema } from "@/contracts/schemas";
import { rotateRefreshSession, signAccessToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, toErrorResponse } from "@/lib/errors";
import { parseJson } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, refreshSchema);
    const rotated = await rotateRefreshSession(body.refreshToken);

    const user = await prisma.user.findUnique({ where: { id: rotated.userId } });
    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "Session user not found");
    }

    const accessToken = await signAccessToken(user.id, user.email);

    return NextResponse.json({
      accessToken,
      refreshToken: rotated.refreshToken,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
