import { NextResponse } from "next/server";

import { loginSchema } from "@/contracts/schemas";
import { createRefreshSession, signAccessToken, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApiError, toErrorResponse } from "@/lib/errors";
import { parseJson } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, loginSchema);
    const email = body.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is invalid");
    }

    const isValid = await verifyPassword(body.password, user.passwordHash);
    if (!isValid) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is invalid");
    }

    const accessToken = await signAccessToken(user.id, user.email);
    const refreshToken = await createRefreshSession(user.id);

    return NextResponse.json({
      user: { id: user.id, email: user.email, timezone: user.timezone },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
