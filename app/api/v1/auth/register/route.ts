import { NextResponse } from "next/server";

import { registerSchema } from "@/contracts/schemas";
import { createRefreshSession, hashPassword, signAccessToken } from "@/lib/auth";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { ApiError, toErrorResponse } from "@/lib/errors";
import { parseJson } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const body = await parseJson(req, registerSchema);
    const email = body.email.trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiError(409, "EMAIL_IN_USE", "Email is already registered");
    }

    const passwordHash = await hashPassword(body.password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        timezone: DEFAULT_TIMEZONE,
        budgetProfile: {
          create: {
            currency: "USD",
            incomeMonthlyCents: 0n,
            fixedMonthlyCents: 0n,
            sourceIncome: "USER_OVERRIDDEN",
            sourceFixed: "USER_OVERRIDDEN",
          },
        },
      },
    });

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
